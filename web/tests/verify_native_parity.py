"""Compare the actual web runner/native engine with independent pooled least squares.

Usage: python tests/verify_native_parity.py prepared.csv /path/to/ddalab
Uses a real prepared recording, all its conditions, all retained trials, all windows.
"""
from pathlib import Path
import importlib.util
import json
import os
import sys
import tempfile
import numpy as np

spec = importlib.util.spec_from_file_location('dda_job', Path(__file__).parents[1]/'runner/job.py')
runner = importlib.util.module_from_spec(spec); spec.loader.exec_module(runner)
prepared = Path(sys.argv[1]).resolve()
os.environ['DDA_ENGINE'] = str(Path(sys.argv[2]).resolve())
names,matches,time_axis,data,sample_rate = runner.load_trials(prepared)
conditions = list(dict.fromkeys(m[2] for m in matches))
config = dict(recordingId='Parity',conditions=conditions,windowLength=50,windowStep=10,delays=[7,10],modelTerms=[1,2,10],dimension=4,order=4,nrTau=2,eventOffset=.2)
with tempfile.TemporaryDirectory(prefix='dda-native-parity-') as temp:
    runner.WORK=Path(temp);runner.OUT=Path(temp)/'output';runner.OUT.mkdir()
    signals=runner.analyze(config,[prepared])
    signal=signals[0]
    max_error=0
    for group in signal['groups']:
        matrix=data[:,[i for i,m in enumerate(matches) if m[2]==group['condition']]]
        reference=[];centers=[]
        for start in range(0,len(matrix)-68+1,10):
            context=matrix[start:start+68]
            shifted=context[4:64]
            scale=shifted.std(axis=0,ddof=1)
            normalized=(shifted-shifted.mean(axis=0))/scale
            derivative=sum((context[4+k:64+k]-context[4-k:64-k])/k for k in range(1,5))/4
            target=(derivative[10:60]/scale).T.reshape(-1)
            x1=normalized[3:53].T.reshape(-1);x2=normalized[0:50].T.reshape(-1)
            coefficients,_,rank,_=np.linalg.lstsq(np.column_stack((x1,x2,x1**4)),target,rcond=None)
            assert rank==3
            reference.append(coefficients[0]);centers.append((start+14+24.5)/sample_rate+time_axis[0]-.2)
        np.testing.assert_allclose(group['a1'],reference,rtol=1e-9,atol=1e-11)
        np.testing.assert_allclose(signal['times'],centers,rtol=0,atol=1e-12)
        max_error=max(max_error,float(np.max(np.abs(np.asarray(group['a1'])-reference))))
    print(json.dumps({'status':'PASS','conditions':len(conditions),'retained_trials':data.shape[1],'windows':len(signal['times']),'native_vs_independent_max_abs_error':max_error},indent=2))
