"""Fetch the official Runtime using checked, parallel HTTP byte ranges."""
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
import shutil
import time
import urllib.request


def download_runtime(url, destination):
    with urllib.request.urlopen(urllib.request.Request(url, method='HEAD'), timeout=60) as response:
        size = int(response.headers['Content-Length'])
    workers = 8
    width = (size + workers - 1) // workers

    def part(index):
        start, end = index * width, min((index + 1) * width, size) - 1
        path = destination.with_suffix(f'.part-{index}')
        for attempt in range(3):
            try:
                request = urllib.request.Request(url, headers={'Range': f'bytes={start}-{end}'})
                with urllib.request.urlopen(request, timeout=120) as response, path.open('wb') as output:
                    if response.status != 206 or response.headers.get('Content-Range') != f'bytes {start}-{end}/{size}':
                        raise RuntimeError('Runtime server returned an invalid byte range')
                    shutil.copyfileobj(response, output, 1024 * 1024)
                if path.stat().st_size != end - start + 1:
                    raise RuntimeError('Runtime archive segment is incomplete')
                return path
            except Exception:
                if attempt == 2:
                    raise
                time.sleep(2 ** attempt)

    with ThreadPoolExecutor(max_workers=workers) as pool:
        parts = list(pool.map(part, range(workers)))
    with destination.open('wb') as output:
        for path in parts:
            with path.open('rb') as source:
                shutil.copyfileobj(source, output, 1024 * 1024)
            path.unlink()
    if destination.stat().st_size != size:
        raise RuntimeError('Runtime archive is incomplete')


if __name__ == '__main__':
    assets = json.loads(Path('runtime-assets.json').read_text())
    download_runtime(assets['matlab']['runtimeUrl'], Path('matlab-runtime.zip'))
    for target, url in [('preparation.tar.gz', assets['matlab']['packageUrl']), ('engine.tar.gz', assets['engine']['binaryUrl'])]:
        urllib.request.urlretrieve(url, target)
    actual = hashlib.sha256(Path('preparation.tar.gz').read_bytes()).hexdigest()
    if actual != assets['matlab']['packageSha256']:
        raise RuntimeError('Preparation archive checksum mismatch')
