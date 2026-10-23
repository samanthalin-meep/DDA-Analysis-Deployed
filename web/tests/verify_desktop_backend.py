"""Check the original desktop loader, CT engine, CSV export, and saved results."""
import csv
import io
import json
import os
from pathlib import Path
import sys
import tempfile

vendor = Path(os.environ.get('DDA_DESKTOP_VENDOR', Path(__file__).parents[1] / 'desktop/vendor'))
sys.path.insert(0, str(vendor))
from ddalab_qt.backend.api import LocalBackendClient
from ddalab_qt.runtime_paths import RuntimePaths
from ddalab_qt.persistence.state_db import StateDatabase
from ddalab_qt.app.dda_export_utils import export_variant_csv
from ddalab_qt.domain.models import DdaReproductionConfig

prepared, reference = map(Path, sys.argv[1:3])
expected = json.loads(reference.read_text())['signals'][0]
client = LocalBackendClient(RuntimePaths.detect())
try:
    dataset = client.load_dataset(str(prepared.resolve()))
    indices = list(range(len(dataset.channels)))
    options = dict(dataset=dataset, selected_channel_indices=indices, selected_variants=['CT'],
        window_length_samples=50, window_step_samples=10, delays=[7, 10],
        start_time_seconds=0.0, end_time_seconds=None,
        variant_channel_indices={'CT': indices}, variant_pair_indices={'CT': []},
        model_terms=[1, 2, 10], model_dimension=4, polynomial_order=4, nr_tau=2)
    result = client.run_dda(**options)
    assert not result.is_fallback
    assert len(result.trial_groups) == 6
    expected_rows = {group['condition']: group['a1'] for group in expected['groups']}
    maximum = max(abs(a-b) for group, row in zip(result.trial_groups, result.variants[0].matrix)
                  for a, b in zip(row, expected_rows[group['condition']], strict=True))
    assert maximum < 1e-10, maximum
    # The desktop's completion handler adds these settings before export.
    result.window_centers_seconds = [value - .2 for value in result.window_centers_seconds]
    result.reproduction = DdaReproductionConfig(ct_pooled=True, event_offset_seconds=.2,
        variant_ids=['CT'], selected_channel_indices=indices,
        selected_channel_names=dataset.channel_names,
        variant_channel_indices={'CT': indices}, variant_channel_names={'CT': dataset.channel_names},
        window_length_samples=50, window_step_samples=10, delays=[7, 10],
        model_terms=[1, 2, 10], model_dimension=4, polynomial_order=4, nr_tau=2)
    exported = list(csv.DictReader(io.StringIO(export_variant_csv(result, 'CT'))))
    assert list(exported[0]) == ['file','electrode','condition','analysis','included_trials','window_number','time_relative_event_s','measure','a1']
    assert len(exported) == 6 * 19
    assert all(row['analysis'] == 'pooled_cross_trial' for row in exported)
    with tempfile.TemporaryDirectory() as directory:
        state = StateDatabase(Path(directory) / 'state.sqlite3')
        state.save_dda_result(result)
        restored = state.load_dda_result_by_id(result.id)
        assert restored.materialize().variants[0].matrix == result.variants[0].matrix
        state.connection.close()
    options['window_step_samples'] = 20
    rerun = client.run_dda(**options)
    assert len(rerun.window_centers_seconds) == 10
    rerun_error = max(abs(a-b) for row, original in zip(rerun.variants[0].matrix, result.variants[0].matrix)
                      for a, b in zip(row, original[::2], strict=True))
    assert rerun_error < 1e-10, rerun_error
    print(json.dumps(dict(passed=True, trials=len(indices), conditions=6, windows=19,
        maximumCoefficientDifference=maximum, rerunWindows=10, rerunDifference=rerun_error,
        nativeCSVExportPassed=True, savedResultRoundTripPassed=True)))
finally:
    client.close()
