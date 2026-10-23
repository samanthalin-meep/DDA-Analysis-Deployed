"""Check a downloaded default-model cloud result against independent NumPy fits.

Usage: python tests/verify_deployed_result.py prepared.csv result.json
Requires NumPy; performs no requests and does not invoke the native engine.
"""
import csv
import json
from pathlib import Path
import sys
import numpy as np

with Path(sys.argv[1]).open(newline='') as stream:
    rows = list(csv.reader(stream))
header, values = rows[0], np.asarray(rows[1:], dtype=float)
result = json.loads(Path(sys.argv[2]).read_text())
config = result['preparation']['config']
for field, expected in dict(windowLength=50, windowStep=10, delays=[7, 10], modelTerms=[1, 2, 10], dimension=4, order=4, nrTau=2).items():
    assert config[field] == expected, f'This independent reference supports the default model: {field}'
assert len(result['signals']) == 1
signal = result['signals'][0]
time_axis, data = values[:, 0], values[:, 1:]
sample_rate = 1 / (time_axis[1] - time_axis[0])
maximum_error = 0.0
for group in signal['groups']:
    indices = [i for i, name in enumerate(header[1:]) if name.split('__')[1] == group['condition']]
    matrix = data[:, indices]
    assert matrix.shape[1] == group['trials']
    reference, centers = [], []
    for start in range(0, len(matrix) - 68 + 1, 10):
        context = matrix[start:start + 68]
        shifted = context[4:64]
        scale = shifted.std(axis=0, ddof=1)
        normalized = (shifted - shifted.mean(axis=0)) / scale
        derivative = sum((context[4 + k:64 + k] - context[4 - k:64 - k]) / k for k in range(1, 5)) / 4
        target = (derivative[10:60] / scale).T.reshape(-1)
        x1, x2 = normalized[3:53].T.reshape(-1), normalized[0:50].T.reshape(-1)
        coefficients, _, rank, _ = np.linalg.lstsq(np.column_stack((x1, x2, x1 ** 4)), target, rcond=None)
        assert rank == 3
        reference.append(coefficients[0])
        centers.append((start + 14 + 24.5) / sample_rate + time_axis[0] - config['eventOffset'])
    np.testing.assert_allclose(group['a1'], reference, rtol=1e-9, atol=1e-11)
    np.testing.assert_allclose(signal['times'], centers, rtol=0, atol=1e-12)
    maximum_error = max(maximum_error, float(np.max(np.abs(np.asarray(group['a1']) - reference))))
assert data.shape[1] == signal['trialCount']
print(json.dumps(dict(passed=True, conditions=len(signal['groups']), retainedTrials=signal['trialCount'], windows=len(signal['times']), maximumAbsoluteCoefficientError=maximum_error), indent=2))
