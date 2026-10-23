"""Browser file operations for the unchanged DDALab Qt application."""
from __future__ import annotations
import json
from pathlib import Path
from queue import Queue
from threading import Lock
import time
import uuid

ROOT = Path(__file__).resolve().parent
USER = ROOT / 'user'
DATA = USER / 'data'
EXPORTS = USER / 'exports'
for directory in (USER, DATA, EXPORTS):
    directory.mkdir(parents=True, exist_ok=True)


class BrowserBridge:
    def __init__(self):
        self.lock = Lock()
        self.commands = Queue()
        self.dialog = None
        self.answers = {}
        self.downloads = []
        self.clipboard = None
        self.ready = False
        self.dataset = ''
        self.busy = False
        self.controls = []
        self.last_activity = time.time()

    def request_file(self, *, multiple=False, folder=False, caption='', filters=''):
        from PySide6.QtCore import QEventLoop, QTimer
        identifier = uuid.uuid4().hex
        with self.lock:
            self.dialog = dict(id=identifier, kind='files', multiple=multiple,
                               folder=folder, title=caption, filters=filters)
        loop = QEventLoop()
        timer = QTimer()
        timer.timeout.connect(lambda: loop.quit() if identifier in self.answers else None)
        timer.start(80)
        # Allow time for browser uploads; idle sessions stop separately.
        QTimer.singleShot(30 * 60 * 1000, loop.quit)
        loop.exec()
        timer.stop()
        with self.lock:
            answer = self.answers.pop(identifier, [])
            if self.dialog and self.dialog.get('id') == identifier:
                self.dialog = None
        return answer

    def request_recording(self):
        with self.lock:
            self.dialog = dict(id=uuid.uuid4().hex, kind='recording')

    def notify_download(self, path):
        path = Path(path).resolve()
        if not path.is_relative_to(EXPORTS.resolve()):
            return
        if path.is_file() and path.stat().st_size:
            with self.lock:
                self.downloads.append(dict(id=uuid.uuid4().hex, name=path.name))

    def answer(self, identifier, paths):
        with self.lock:
            if self.dialog and self.dialog.get('kind') == 'files':
                self.answers[identifier] = paths
            if self.dialog and self.dialog.get('id') == identifier:
                self.dialog = None


bridge = BrowserBridge()
