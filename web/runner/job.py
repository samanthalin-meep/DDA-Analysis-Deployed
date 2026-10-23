"""Run the original compiled MATLAB preparation and condition-aware Rust pooled CT.

Input is a JSON configuration written by the authenticated Vercel job workflow.
The MATLAB license is used only on the build machine, never in this runner.
"""
from __future__ import annotations
import csv
import hashlib
import io
import json
import math
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time
import traceback
import urllib.request
import numpy as np

ROOT = Path(__file__).resolve().parent
WORK = Path(os.environ.get('DDA_WORK_DIR', ROOT / 'work'))
OUT = WORK / 'output'
COLUMN = re.compile(r'^(E[0-9]+|AVG_E[0-9]+(?:_E[0-9]+)*)__([A-Za-z][A-Za-z0-9_-]*)__trial_([A-Za-z0-9_-]+)$')

def atomic_json(path: Path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix('.tmp')
    temp.write_text(json.dumps(value, allow_nan=False))
    temp.replace(path)

def status(stage, progress, state='running', **extra):
    atomic_json(WORK / 'status.json', dict(state=state, stage=stage, progress=progress, **extra))

class PreparationOutput(io.StringIO):
    def __init__(self):
        super().__init__()
        self.pending = ''
    def write(self, text):
        sys.__stdout__.write(text)
        sys.__stdout__.flush()
        self.pending = (self.pending + text)[-16000:]
        stages = [('1. Parse', 'Matching event times and condition labels', 17), ('2. Import', 'Reading EEG voltages and checking event pulses', 24), ('3. Reference', 'Referencing and filtering EEG', 34), ('4. Interpolate', 'Interpolating channels and resampling', 45), ('5. Epoch', 'Preparing trials and checking artifacts', 54), ('6. Export', 'Saving prepared trials', 61)]
        for marker, label, progress in stages:
            if marker in self.pending:
                status(label, progress)
        return len(text)

def download(url: str, target: Path, max_bytes: int):
    request = urllib.request.Request(url, headers={'User-Agent': 'DDA-Analysis/1.0'})
    total = 0
    with urllib.request.urlopen(request, timeout=120) as response, target.open('wb') as output:
        while block := response.read(1024 * 1024):
            total += len(block)
            if total > max_bytes:
                raise ValueError('An input file exceeds the supported size.')
            output.write(block)
    if total == 0:
        raise ValueError('An input file is empty.')

def prepare(config, files):
    import dda_preparation
    cfg = dict(projectRoot=str(ROOT), edfFile=str(files['edf']), acquisitionLog=str(files['log']),
               eventCSV=str(files['conditions']), recordingID=config['recordingId'], outputRoot=str(OUT),
               electrodes=config['electrodes'], conditions=config['conditions'], averageElectrodes=config['averageElectrodes'])
    status('Starting EEG preparation', 12)
    dda_preparation.initialize_runtime(['-nodisplay'])
    package = dda_preparation.initialize()
    try:
        package.dda_prep_runtime(json.dumps(cfg), nargout=1, stdout=PreparationOutput(), stderr=PreparationOutput())
    finally:
        package.terminate()

def load_trials(path):
    with path.open(encoding='utf-8-sig', newline='') as f:
        reader = csv.reader(f)
        header = next(reader)
        if not header or header[0].strip().lower() != 'time':
            raise ValueError('Prepared data must start with a time column.')
        names = header[1:]
        matches = [COLUMN.fullmatch(name) for name in names]
        if not names or not all(matches):
            raise ValueError('Use the condition-labelled trial CSV produced by DDA_prep.')
        if len(set(names)) != len(names) or len({m[3] for m in matches}) != len(matches):
            raise ValueError('Prepared data contains duplicate trials.')
        signals = {m[1] for m in matches}
        if len(signals) != 1:
            raise ValueError('A prepared CSV must contain one electrode or one electrode average.')
        data = np.array([[float(x) for x in row] for row in reader if row], dtype=np.float64)
    if data.ndim != 2 or data.shape[1] != len(header) or len(data) < 8 or not np.isfinite(data).all():
        raise ValueError('Prepared data contains invalid or missing samples.')
    dt = np.diff(data[:, 0])
    if np.any(dt <= 0) or not np.allclose(dt, dt[0], rtol=1e-7, atol=1e-12):
        raise ValueError('Prepared trial samples must be evenly spaced.')
    return names, matches, data[:, 0], data[:, 1:], 1 / float(dt[0])

class Engine:
    def __init__(self):
        binary = os.environ.get('DDA_ENGINE', str(ROOT / 'bin' / 'ddalab'))
        self.process = subprocess.Popen([binary, 'serve', '--preview-columns', '2048'], stdin=subprocess.PIPE,
            stdout=subprocess.PIPE, stderr=(WORK / 'engine.log').open('w'), text=True, bufsize=1)
    def request(self, params):
        self.process.stdin.write(json.dumps({'method': 'run_group_matrix_file', 'params': params}) + '\n')
        self.process.stdin.flush()
        while line := self.process.stdout.readline():
            message = json.loads(line)
            if message.get('event') == 'progress':
                continue
            if message.get('ok') is not True:
                raise ValueError(message.get('error') or 'The DDA engine rejected this configuration.')
            result = message['result']
            if result.get('backend') != 'pure-rust':
                raise ValueError('Unexpected analysis engine response.')
            return result['result']
        raise ValueError('The analysis engine stopped before returning a result.')
    def close(self):
        self.process.terminate()
        try:
            self.process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            self.process.kill()

def analyze(config, paths):
    signals, raw_results, graph = [], [], []
    engine = Engine()
    try:
        for index, path in enumerate(paths):
            names, matches, time_axis, data, sample_rate = load_trials(path)
            signal = matches[0][1]
            groups, times = [], None
            for number, condition in enumerate(config['conditions']):
                indices = [i for i, m in enumerate(matches) if m[2] == condition]
                if len(indices) < 2:
                    raise ValueError(f'{signal}, {condition}: at least two retained trials are required.')
                progress = 65 + 30 * (index + number / len(config['conditions'])) / len(paths)
                status(f'Analyzing {signal} · {condition}', progress)
                matrix = np.ascontiguousarray(data[:, indices], dtype='<f8')
                matrix_path = WORK / 'fit-input.f64'
                matrix.tofile(matrix_path)
                params = dict(file=path.name, matrix_path=str(matrix_path), rows=matrix.shape[0], cols=matrix.shape[1],
                    channel_labels=[names[i] for i in indices], channels=list(range(len(indices))), variants=['CT'],
                    wl=config['windowLength'], ws=config['windowStep'], delays=config['delays'],
                    model_terms=config['modelTerms'], dm=config['dimension'], order=config['order'], nr_tau=config['nrTau'],
                    ct_wl=len(indices), ct_ws=len(indices), sr=None)
                result = engine.request(params)
                a1 = result['q_matrix']
                if len(a1) != 1 or not a1[0] or not all(math.isfinite(v) for v in a1[0]):
                    raise ValueError('Pooled CT did not produce one valid shared fit per condition.')
                # The engine returns the exclusive context-window end samples.
                # A fit excludes dm derivative samples at each end and max(delay)
                # at the start. Match the desktop app's actual fitted-sample centers.
                centers = [(end - config['dimension'] - (config['windowLength'] + 1) / 2) / sample_rate
                           + float(time_axis[0]) - config['eventOffset'] for end in result['error_values']]
                if len(centers) != len(a1[0]) or (times is not None and not np.allclose(centers, times, rtol=0, atol=1e-12)):
                    raise ValueError('Condition result time axes do not agree.')
                times = centers
                groups.append(dict(condition=condition, trials=len(indices), a1=a1[0]))
                raw_results.append(dict(signal=signal, condition=condition, trialCount=len(indices), request={k:v for k,v in params.items() if k!='matrix_path'}, result=result))
                for t, value in zip(centers, a1[0]):
                    graph.append([config['recordingId'], signal, condition, len(indices), t, value])
            selected = [i for i,m in enumerate(matches) if m[2] in config['conditions']]
            mean = data[:, selected].mean(axis=1)
            stride = max(1, len(mean) // 1500)
            signals.append(dict(signal=signal, sampleRate=sample_rate, samples=len(data), trialCount=len(selected), groups=groups,
                times=times, waveform=[dict(time=float(t - config['eventOffset']), value=float(v)) for t,v in zip(time_axis[::stride],mean[::stride])]))
    finally:
        engine.close()
    with (OUT / 'analysis.csv').open('w', newline='') as f:
        writer=csv.writer(f); writer.writerow(['recording_id','signal','condition','included_trials','time_relative_event_s','a1']); writer.writerows(graph)
    atomic_json(OUT / 'native-results.json', raw_results)
    return signals

def run():
    settings = json.loads((ROOT / 'job-config.json').read_text())
    config = settings['config']
    if not re.fullmatch(r'[A-Za-z0-9_]{1,64}', config['recordingId']):
        raise ValueError('Invalid recording ID.')
    WORK.mkdir(exist_ok=True)
    inputs = WORK / 'input'; inputs.mkdir(exist_ok=True)
    files = {}; prepared = []
    status('Downloading your recording', 10)
    for number, descriptor in enumerate(settings['inputs']):
        role = descriptor['role']
        suffix = '.edf' if role == 'edf' else '.txt' if role == 'log' else '.csv'
        target = inputs / f'{role}-{number}{suffix}'
        if descriptor.get('localPath') and os.environ.get('DDA_LOCAL_TEST') == '1':
            shutil.copyfile(descriptor['localPath'], target)
        else:
            download(descriptor['url'], target, descriptor['size'])
        if target.stat().st_size != descriptor['size']:
            raise ValueError('The downloaded recording does not match its uploaded size.')
        if role == 'prepared':
            OUT.mkdir(exist_ok=True)
            name = f'DDA_{config["recordingId"]}_{number + 1}.csv'
            destination = OUT / name
            shutil.copyfile(target, destination)
            prepared.append(destination)
        else:
            files[role] = target
    if files:
        prepare(config, files)
        prepared = sorted(p for p in OUT.glob('DDA_*.csv') if not p.name.endswith('_Counts.csv'))
    if not prepared:
        raise ValueError('Preparation did not produce a trial data CSV.')
    counts = []
    for path in OUT.glob('*_Counts.csv'):
        with path.open(encoding='utf-8-sig', newline='') as f:
            counts = [{k: (v if k == 'condition' else int(v)) for k,v in row.items()} for row in csv.DictReader(f)]
    signals = [] if settings.get('preparationOnly') else analyze(config, prepared)
    assets_file = ROOT / 'runtime-assets.json'
    assets = json.loads(assets_file.read_text()) if assets_file.exists() else {}
    preparation = dict(recipe='DDA_prep.m', compiled=bool(files), config=config, runtime=assets.get('matlab', {}))
    if not settings.get('preparationOnly'):
        result = dict(recordingId=config['recordingId'], counts=counts, signals=signals, preparation=preparation, engine='DDALab pooled CT · Rust')
        atomic_json(OUT / 'result.json', result)
    atomic_json(OUT / 'provenance.json', dict(preparation=preparation,
        artifacts=[dict(name=p.name, bytes=p.stat().st_size, sha256=hashlib.sha256(p.read_bytes()).hexdigest()) for p in prepared]))
    artifacts = []
    for path in sorted(OUT.iterdir()):
        if not path.is_file(): continue
        kind = 'prepared' if path in prepared else 'counts' if path.name.endswith('_Counts.csv') else 'graph' if path.name == 'analysis.csv' else 'result' if path.name == 'result.json' else 'provenance'
        artifacts.append(dict(name=path.name, kind=kind))
    status('Ready to explore', 100, state='complete', artifacts=artifacts)

if __name__ == '__main__':
    try:
        run()
    except Exception as error:
        traceback.print_exc()
        status('Recording needs attention', 0, state='failed', error=str(error)[:1600])
        sys.exit(1)
