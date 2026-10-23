"""Run the actual Qt program offscreen and render its native analysis interface."""
import json
import os
from pathlib import Path
import shutil
import sys
import time

os.environ['QT_QPA_PLATFORM'] = 'offscreen'
root = Path(os.environ['DDA_DESKTOP_ROOT'])
sys.path[:0] = [str(root), str(root / 'vendor')]
from PySide6.QtWidgets import QApplication, QPushButton
from ddalab_qt.app import main_window
from ddalab_qt.persistence.state_db import StateDatabase
from ddalab_qt.runtime_paths import RuntimePaths
from ddalab_qt.ui.style import apply_theme
from bridge import USER, DATA, bridge
from accessibility import capture, act
from ste_copy import apply_copy

prepared, reference = map(Path, sys.argv[1:3])
DATA.mkdir(exist_ok=True, parents=True)
fixture = DATA / prepared.name
shutil.copyfile(prepared, fixture)
app = QApplication([])
runtime = RuntimePaths.detect()
apply_theme(app, runtime)
main_window.StateDatabase = lambda: StateDatabase(USER / 'state.sqlite3')
window = main_window.build_main_window(runtime_paths=runtime, server_url=None, bootstrap_backend=False)
header = window.open_button.parentWidget()
upload = QPushButton('Upload recording', header)
header.layout().insertWidget(header.layout().count()-1, upload)
window.resize(1440, 1000)
window.show()

def until(predicate, seconds=45):
    deadline = time.monotonic() + seconds
    while not predicate():
        app.processEvents()
        if time.monotonic() > deadline:
            raise AssertionError('The native interface did not finish its task.')
        time.sleep(.02)
    app.processEvents()

window._open_dataset(str(fixture))
until(lambda: window._dataset_loading_path is None and window.state.selected_dataset is not None)
window.primary_nav.setCurrentIndex(2)
app.processEvents()
apply_copy(window)
capture(window)
act(dict(id=str(id(window.dda_ct_select_all_button)), operation='click'))
assert window.dda_event_offset_spin.value() == 1.2
window._run_dda()
until(lambda: window._dda_run_started_at is None and window.state.dda_result is not None)
result = window.state.dda_result.materialize()
expected = {group['condition']: group['a1'] for group in json.loads(reference.read_text())['signals'][0]['groups']}
maximum = max(abs(a-b) for group,row in zip(result.trial_groups,result.variants[0].matrix)
              for a,b in zip(row,expected[group['condition']],strict=True))
assert len(result.trial_groups) == 6 and maximum < 1e-10
window.dda_result_tabs.setCurrentIndex(1)
app.processEvents()
window.dda_result_tabs.setCurrentIndex(0)
apply_copy(window)
app.processEvents()
window._save_session_state()
assert window.grab().save(str(root / 'native-ddalab-preview.png'))
print(json.dumps(dict(passed=True, originalQtProgramRan=True, browserControlBridgePassed=True,
    retainedTrials=sum(len(group['channel_indices']) for group in result.trial_groups),
    conditions=len(result.trial_groups), windows=len(result.window_centers_seconds),
    maximumCoefficientDifference=maximum, nativeGraphAndHeatmapRendered=True)))
window.close()
window._task_executor.shutdown(wait=True)
