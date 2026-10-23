"""Compare compiled preparation CSVs with an original MATLAB reference run."""

import argparse
import csv
import hashlib
import json
import math
from pathlib import Path


def compare(reference: Path, candidate: Path) -> dict:
    expected = sorted(path.name for path in reference.glob('*.csv'))
    actual = sorted(path.name for path in candidate.glob('*.csv'))
    if not expected or actual != expected:
        raise AssertionError(f'CSV file sets differ: {expected!r} != {actual!r}')
    results = []
    for name in expected:
        reference_bytes = (reference / name).read_bytes()
        candidate_bytes = (candidate / name).read_bytes()
        if 'Counts' in name:
            if reference_bytes != candidate_bytes:
                raise AssertionError(f'Condition/artifact/trial counts differ in {name}')
            results.append({'file': name, 'byteIdentical': True})
            continue
        with (reference / name).open(newline='') as stream:
            a = list(csv.reader(stream))
        with (candidate / name).open(newline='') as stream:
            b = list(csv.reader(stream))
        if len(a) != len(b) or a[0] != b[0]:
            raise AssertionError(f'Trial headers or sample count differ in {name}')
        maximum_error = 0.0
        for row_a, row_b in zip(a[1:], b[1:], strict=True):
            if len(row_a) != len(row_b):
                raise AssertionError(f'Trial count differs in {name}')
            for value_a, value_b in zip(row_a, row_b, strict=True):
                x, y = float(value_a), float(value_b)
                if not math.isclose(x, y, rel_tol=1e-5, abs_tol=1e-5):
                    raise AssertionError(f'Voltage/time differs in {name}: {x} != {y}')
                maximum_error = max(maximum_error, abs(x - y))
        results.append({
            'file': name,
            'samples': len(a) - 1,
            'trials': len(a[0]) - 1,
            'maximumAbsoluteError': maximum_error,
            'byteIdentical': reference_bytes == candidate_bytes,
            'referenceSHA256': hashlib.sha256(reference_bytes).hexdigest(),
            'candidateSHA256': hashlib.sha256(candidate_bytes).hexdigest(),
        })
    return {'passed': True, 'files': results}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('reference', type=Path)
    parser.add_argument('candidate', type=Path)
    args = parser.parse_args()
    print(json.dumps(compare(args.reference, args.candidate), indent=2))
