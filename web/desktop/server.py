"""Authenticated browser transport; never receives a Blob account token."""
from __future__ import annotations
import asyncio
import hashlib
import html
import io
import json
from pathlib import Path, PurePosixPath
import re
import secrets
import sqlite3
import tarfile
import time
from threading import Event
import uuid
from urllib.parse import urlparse

import aiohttp
from aiohttp import web
from bridge import ROOT, USER, DATA, EXPORTS, bridge

CONFIG = json.loads((ROOT / 'session-config.json').read_text())
TOKEN = CONFIG['token']
MAX_BYTES = 512 * 1024 ** 2


def valid_path(name):
    path = PurePosixPath(name.replace('\\', '/'))
    if path.is_absolute() or '..' in path.parts or len(str(path)) > 500:
        raise web.HTTPBadRequest(text='Invalid file name.')
    parts = [re.sub(r'[^A-Za-z0-9_. -]', '_', part).strip('. ') for part in path.parts]
    if not parts or not all(parts):
        raise web.HTTPBadRequest(text='Invalid file name.')
    return Path(*parts)


@web.middleware
async def authorize(request, handler):
    if request.path.startswith('/api/') or request.path == '/vnc':
        supplied = request.headers.get('Authorization', '').removeprefix('Bearer ')
        supplied = supplied or request.query.get('token', '')
        if not secrets.compare_digest(supplied, TOKEN):
            raise web.HTTPUnauthorized(text='Session expired.')
    try:
        response = await handler(request)
    except web.HTTPException as error:
        response = error
    response.headers['Cache-Control'] = 'no-store'
    response.headers['Referrer-Policy'] = 'no-referrer'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['Content-Security-Policy'] = f"frame-ancestors {CONFIG['parentOrigin']}; object-src 'none'; base-uri 'none'"
    return response


async def health(request):
    return web.json_response(dict(ready=bridge.ready, dataset=Path(bridge.dataset).name,
                                  busy=bridge.busy, lastActivity=bridge.last_activity))


async def index(request):
    source=(ROOT / 'viewer.html').read_text().replace('__PARENT_ORIGIN__',html.escape(CONFIG['parentOrigin'],quote=True))
    return web.Response(text=source,content_type='text/html')


async def events(request):
    if request.query.get('hold') == '1':
        bridge.last_activity = time.time()
    with bridge.lock:
        value = dict(dialog=bridge.dialog, downloads=bridge.downloads[-100:],
                     dataset=Path(bridge.dataset).name, busy=bridge.busy, controls=bridge.controls, lastActivity=bridge.last_activity)
    return web.json_response(value)


async def control(request):
    body = await request.json()
    if body.get('operation') not in ('click', 'focus', 'change') or not isinstance(body.get('id'), str):
        raise web.HTTPBadRequest(text='Invalid control.')
    bridge.commands.put(dict(action='control', id=body['id'], operation=body['operation'], value=body.get('value')))
    bridge.last_activity = time.time()
    return web.json_response(dict(ok=True))


async def answer(request):
    body = await request.json()
    bridge.answer(str(body['id']), [])
    return web.json_response(dict(ok=True))


async def fetch_file(client, item, path):
    url = urlparse(item['url'])
    if url.scheme != 'https' or not (url.hostname or '').endswith('.private.blob.vercel-storage.com'):
        raise web.HTTPBadRequest(text='Invalid input address.')
    path.parent.mkdir(parents=True, exist_ok=True)
    async with client.get(item['url']) as response:
        response.raise_for_status()
        size = 0
        with path.open('wb') as stream:
            async for chunk in response.content.iter_chunked(1024 * 1024):
                size += len(chunk)
                if size > MAX_BYTES:
                    raise web.HTTPBadRequest(text='The input file is too large.')
                stream.write(chunk)
    if size != item['size']:
        raise web.HTTPBadRequest(text='The input file is incomplete.')


async def open_files(request):
    bridge.last_activity = time.time()
    body = await request.json()
    identifier = str(body.get('dialogId', ''))
    with bridge.lock:
        dialog = bridge.dialog
    if not dialog or dialog['id'] != identifier or dialog['kind'] != 'files':
        raise web.HTTPConflict(text='Open the file prompt again.')
    items = body.get('files', [])
    if not items or len(items) > 1000 or sum(item['size'] for item in items) > 1024 ** 3:
        raise web.HTTPBadRequest(text='Select fewer files.')
    destination = DATA / uuid.uuid4().hex
    destination.mkdir()
    paths = []
    async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=240)) as client:
        for item in items:
            path = destination / valid_path(item['name'])
            await fetch_file(client, item, path)
            paths.append(str(path))
    selected = [str(destination / Path(paths[0]).relative_to(destination).parts[0])] if dialog.get('folder') else paths
    bridge.answer(identifier, selected)
    return web.json_response(dict(ok=True))


async def import_preparation(request):
    bridge.last_activity = time.time()
    body = await request.json()
    identifier = str(body.get('jobId', ''))
    if not re.fullmatch(r'[a-f0-9-]{36}', identifier):
        raise web.HTTPBadRequest(text='Invalid recording.')
    marker = USER / f'imported-{identifier}.json'
    if marker.exists():
        return web.json_response(dict(ok=True))
    destination = DATA / identifier
    destination.mkdir(exist_ok=True)
    paths = []
    async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=300)) as client:
        for item in body.get('files', []):
            path = destination / valid_path(item['name']).name
            await fetch_file(client, item, path)
            if item['kind'] == 'prepared':
                paths.append(str(path))
    if not paths:
        raise web.HTTPBadRequest(text='No prepared file found.')
    marker.write_text(json.dumps(dict(paths=paths)))
    bridge.commands.put(dict(action='open', paths=paths))
    return web.json_response(dict(ok=True))


async def download(request):
    name = request.match_info['name']
    path = EXPORTS / valid_path(name).name
    if not path.is_file():
        raise web.HTTPNotFound(text='File not found.')
    return web.FileResponse(path, headers={'Content-Disposition': f'attachment; filename="{path.name}"'})


def state_fingerprint():
    value = hashlib.sha256()
    for path in sorted(USER.rglob('*')):
        if not path.is_file() or path.is_symlink() or path.name.endswith('-shm'):
            continue
        stat = path.stat()
        value.update(f'{path.relative_to(USER)}\0{stat.st_size}\0{stat.st_mtime_ns}'.encode())
    return value.hexdigest()


def pack_state(target):
    database = USER / 'state.sqlite3'
    backup = ROOT / 'state-backup.sqlite3'
    if database.exists():
        with sqlite3.connect(database) as source, sqlite3.connect(backup) as destination:
            source.backup(destination)
    with tarfile.open(target, 'w:gz') as archive:
        for path in USER.rglob('*'):
            if not path.is_file() or path.is_symlink() or path.name in ('state.sqlite3', 'state.sqlite3-wal', 'state.sqlite3-shm'):
                continue
            archive.add(path, arcname=str(path.relative_to(USER)), recursive=False)
        if backup.exists():
            archive.add(backup, arcname='state.sqlite3', recursive=False)


async def checkpoint(request):
    saved = Event()
    bridge.commands.put(dict(action='save', ack=saved))
    if not await asyncio.to_thread(saved.wait, 10):
        raise web.HTTPServiceUnavailable(text='Wait for DDALab to save.')
    fingerprint = state_fingerprint()
    if request.headers.get('If-None-Match') == fingerprint:
        return web.Response(status=304)
    target = ROOT / 'checkpoint.tar.gz'
    await asyncio.to_thread(pack_state, target)
    return web.FileResponse(target, headers={'X-DDA-State': fingerprint, 'Content-Type': 'application/gzip'})


async def vnc(request):
    socket = web.WebSocketResponse(max_msg_size=16 * 1024 ** 2, protocols=('binary',))
    await socket.prepare(request)
    reader, writer = await asyncio.open_connection('127.0.0.1', 5900)

    async def to_browser():
        while data := await reader.read(64 * 1024):
            await socket.send_bytes(data)

    async def to_program():
        async for message in socket:
            if message.type == aiohttp.WSMsgType.BINARY:
                if message.data and message.data[0] in (4, 5, 6):
                    bridge.last_activity = time.time()
                writer.write(message.data)
                await writer.drain()
            elif message.type in (aiohttp.WSMsgType.CLOSE, aiohttp.WSMsgType.ERROR):
                break

    tasks = [asyncio.create_task(to_browser()), asyncio.create_task(to_program())]
    try:
        await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
    finally:
        for task in tasks:
            task.cancel()
        writer.close()
        await socket.close()
    return socket


def serve():
    application = web.Application(middlewares=[authorize], client_max_size=1024 ** 3)
    application.add_routes([
        web.get('/', index), web.get('/vnc', vnc), web.get('/api/health', health),
        web.get('/api/events', events), web.post('/api/dialog/cancel', answer),
        web.post('/api/control', control),
        web.post('/api/open-files', open_files),
        web.post('/api/import', import_preparation),
        web.get('/api/download/{name}', download), web.get('/api/checkpoint', checkpoint),
    ])
    application.router.add_static('/novnc', ROOT / 'novnc', follow_symlinks=False)
    application.router.add_static('/assets', ROOT / 'viewer-assets', follow_symlinks=False)
    web.run_app(application, host='0.0.0.0', port=8080, handle_signals=False,
                access_log=None, print=None)
