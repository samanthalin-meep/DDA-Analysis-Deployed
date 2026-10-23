"""Launch the original Qt program with browser file dialogs and saved state."""
from __future__ import annotations
import json
import os
from pathlib import Path
import re
import sys
import threading
import time

from bridge import ROOT, USER, DATA, EXPORTS, bridge
sys.path.insert(0, str(ROOT / 'vendor'))

from PySide6.QtCore import QTimer
from PySide6.QtWidgets import QApplication, QFileDialog, QInputDialog, QLineEdit, QPushButton, QWidget
from ddalab_qt.app import main_window
from ddalab_qt.persistence.state_db import StateDatabase
from ddalab_qt.runtime_paths import RuntimePaths
from ddalab_qt.ui.style import apply_theme
from ste_copy import apply_copy
from accessibility import capture, act


class BrowserRuntimePaths(RuntimePaths):
    def browser_fallback_root(self):
        return DATA


def file_name(parent=None, caption='', directory='', filter='', *args, **kwargs):
    paths = bridge.request_file(caption=caption, filters=filter)
    return (paths[0] if paths else '', filter)


def file_names(parent=None, caption='', directory='', filter='', *args, **kwargs):
    return bridge.request_file(multiple=True, caption=caption, filters=filter), filter


def folder_name(parent=None, caption='', directory='', *args, **kwargs):
    paths = bridge.request_file(folder=True, caption=caption)
    return paths[0] if paths else ''


def save_name(parent=None, caption='', directory='', filter='', *args, **kwargs):
    default = Path(directory).name or 'result.csv'
    dialog = QInputDialog(parent)
    dialog.setWindowTitle('Save file')
    dialog.setLabelText('File name')
    dialog.setTextValue(default)
    dialog.setOkButtonText('Save')
    dialog.setCancelButtonText('Cancel')
    if not dialog.exec():
        return '', filter
    name = re.sub(r'[^A-Za-z0-9_. -]', '_', dialog.textValue()).strip('. ')[:160]
    if not name:
        return '', filter
    if not Path(name).suffix and Path(default).suffix:
        name += Path(default).suffix
    path = EXPORTS / name
    # Qt processes this after the synchronous desktop export returns.
    QTimer.singleShot(150, lambda: bridge.notify_download(path))
    return str(path), filter


def main():
    from server import serve
    app = QApplication(sys.argv)
    app.setApplicationName('DDALAB Pooled')
    app.setApplicationVersion('1.2.10')
    detected = RuntimePaths.detect()
    runtime = BrowserRuntimePaths(**detected.__dict__)
    apply_theme(app, runtime)
    main_window.StateDatabase = lambda: StateDatabase(USER / 'state.sqlite3')
    QFileDialog.getOpenFileName = staticmethod(file_name)
    QFileDialog.getOpenFileNames = staticmethod(file_names)
    QFileDialog.getExistingDirectory = staticmethod(folder_name)
    QFileDialog.getSaveFileName = staticmethod(save_name)
    window = main_window.build_main_window(runtime_paths=runtime, server_url=None)
    window._allow_update_checks = False
    window.repo_root = DATA
    window.state.browser_path = str(DATA)
    header = window.open_button.parentWidget()
    upload = QPushButton('Upload recording', header)
    upload.clicked.connect(bridge.request_recording)
    header.layout().insertWidget(header.layout().count() - 1, upload)
    QWidget.setTabOrder(window.open_button, upload)
    QWidget.setTabOrder(upload, window.run_button)
    window.setWindowTitle('DDALAB Pooled')
    window.showFullScreen()
    pending = []

    def control_action(command):
        try:
            act(command)
        except (RuntimeError, ValueError, TypeError) as error:
            print('Control error:', type(error).__name__, str(error), flush=True)

    def tick():
        while not bridge.commands.empty():
            command = bridge.commands.get_nowait()
            if command['action'] == 'open':
                pending.extend(command['paths'])
            elif command['action'] == 'save':
                window._save_session_state()
                if command.get('ack'):
                    command['ack'].set()
            elif command['action'] == 'close':
                window._save_session_state()
                app.quit()
            elif command['action'] == 'control':
                QTimer.singleShot(0, lambda command=command: control_action(command))
        if pending and not window._dataset_loading_path and window._dda_run_started_at is None:
            window._open_dataset(pending.pop(0))
        bridge.dataset = window.state.active_file_path or ''
        bridge.busy = bool(window._dataset_loading_path or window._dda_run_started_at)
        apply_copy(window)
        capture(window)

    timer = QTimer(window)
    timer.timeout.connect(tick)
    timer.start(200)
    bridge.ready = True
    threading.Thread(target=serve, daemon=True).start()
    return app.exec()


if __name__ == '__main__':
    raise SystemExit(main())
