"""Browser translation of the checked-in DDA_prep.m / EEGLAB recipe.

This module also runs under CPython for comparison with the MATLAB oracle.
No recording is sent to a server. Original sources and licenses remain in the
repository; algorithms and their source references are listed in SOURCE.md.
"""
import csv
import io
import json
import math
import re
import numpy as np
from scipy import signal, special

CONDITIONS = ['control', 'exp1', 'exp2', 'exp3', 'exp4', 'exp5', 'reject', 'start']
# This checks the stimulus schedule, not EEG onset accuracy. Actual onsets always
# come from the acquisition log and must match physical Status pulses exactly.
SCHEDULE_TOLERANCE_SECONDS = 0.1


def require(ok, message):
    if not ok:
        raise ValueError(message)


def read_condition_rows(csv_text):
    reader = csv.reader(io.StringIO(csv_text.lstrip('\ufeff')))
    original_header = next(reader, [])
    header = [name.strip().lower() for name in original_header]
    require(len(set(header)) == len(header), 'The CSV header has repeated columns.')
    label_column = 'label' if 'label' in header else 'condition'
    duration_table = 'sec_time' not in header
    require(label_column in header and (not duration_table or all(name in header for name in ('duration', 'intertrial interval'))),
            'Use sec_time and label, or Duration, Intertrial Interval and Condition columns.')
    rows = []
    for row_number, values in enumerate(reader, 2):
        if not values: continue
        require(len(values) == len(header), 'The CSV columns do not match its header.')
        row = dict(zip(header, values))
        if 'label' in row and 'condition' in row:
            require(row['label'] == row['condition'], f'The condition columns differ at CSV row {row_number}.')
        row['label'] = row[label_column]
        for name in ('duration', 'intertrial interval') if duration_table else ('sec_time',):
            value = row[name].strip()
            require(re.fullmatch(r'[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?', value),
                    f'Invalid {original_header[header.index(name)]} at CSV row {row_number}. Use nonnegative seconds.')
            row[name] = float(value)
            require(math.isfinite(row[name]) and row[name] >= 0,
                    f'Invalid {original_header[header.index(name)]} at CSV row {row_number}. Use nonnegative seconds.')
        require(row['label'] in CONDITIONS, 'Unknown condition: '+row['label'])
        rows.append(row)
    require(rows, 'The conditions CSV has no events.')
    return rows, duration_table


def read_events(log_text, csv_text):
    rows, duration_table = read_condition_rows(csv_text)
    pattern = r'^(\d+):(\d+):(\d+)\.(\d+)\.(\d+): Event: (\d+):(\d+):(\d+)\.(\d+), ([^,]+),'
    physical_events = []
    for line in log_text.splitlines():
        m = re.match(pattern, line)
        if m:
            n = [int(x) for x in m.groups()[:9]]
            physical_events.append((n[0]*3600+n[1]*60+n[2]+n[3]/1000+n[4]/1e6,
                           n[5]*3600+n[6]*60+n[7]+n[8]/1000, m[10]))
    events = [event for event in physical_events if event[2] in ('STRT', 'stim')]
    require(len(events) >= 2, 'The TXT file has no usable events.')
    require(len(rows) == len(events), 'The CSV and TXT trial event counts differ.')
    for row, event in zip(rows, events):
        if not duration_table:
            require(abs(row['sec_time']-event[0]) < 1e-8, 'The CSV times do not match the TXT file.')
        require(event[2] in ('STRT', 'stim') and (event[2] == 'STRT') == (row['label'] == 'start'),
                'The CSV labels do not match the acquisition event codes.')
    if duration_table:
        for index, row in enumerate(rows[:-1]):
            expected = row['duration'] + row['intertrial interval']
            actual = events[index+1][1] - events[index][1]
            require(expected > 0 and abs(actual-expected) <= SCHEDULE_TOLERANCE_SECONDS + 1e-8,
                    f'The duration table does not match the TXT timing at CSV row {index+2}. Use files from one recording.')
    durations = re.findall(r'Recording duration ([0-9.]+), record duration', log_text)
    rate = re.search(r'Sampling Rate:\s*(\d+) s/s', log_text)
    require(len(durations) == 1 and rate and int(rate[1]) == 1000,
            'Use one continuous 1000 Hz acquisition log.')
    return events, [r['label'] for r in rows], float(durations[0]), physical_events


def trial_samples(status, events, physical_events=None):
    expected = np.array([e[1]*1000 for e in (physical_events if physical_events is not None else events)])
    ix = np.rint(expected).astype(int)-1
    require(np.all(ix >= 0) and np.all(ix < len(status)) and np.all(np.diff(ix)>1), 'The event samples are invalid.')
    # Verify every logged event, including system markers omitted from trial rows.
    pulse = status[ix[0]]
    found = np.flatnonzero(status == pulse)+1
    require(len(found) == len(expected) and np.max(np.abs(found-expected)) < 1e-6,
            'The physical Status pulses do not match the TXT events.')
    indices = np.rint([e[1]*1000 for e in events]).astype(int)
    require(np.all(np.isin(indices, found)), 'A trial does not match a physical Status pulse.')
    return indices


def read_edf(path, duration, events, progress=lambda *x: None, physical_events=None):
    with open(path, 'rb') as f:
        h = f.read(256)
        require(len(h) == 256 and h[:8].strip() == b'0', 'Use an EDF recording.')
        n = int(h[252:256]); records = int(h[236:244]); record_seconds = float(h[244:252])
        require(n == 130 and record_seconds > 0, 'Use the 130-channel HydroCel recording.')
        rest = f.read(n*256); pos = 0; fields = {}
        for name, width in [('labels',16), ('transducer',80), ('unit',8), ('pmin',8), ('pmax',8),
                            ('dmin',8), ('dmax',8), ('filter',80), ('samples',8), ('reserved',32)]:
            fields[name] = [rest[pos+i*width:pos+(i+1)*width].decode('ascii').strip() for i in range(n)]
            pos += n*width
        require(fields['labels'] == ['E'+str(i) for i in range(1,130)]+['Status'],
                'The EDF channel names or order differ from E1–E129, Status.')
        ns = np.array(fields['samples'], dtype=int)
        require(np.all(ns == ns[0]) and ns[0]/record_seconds == 1000, 'Use a 1000 Hz EDF recording.')
        require(all(u in ('uV', 'µV', '') for u in fields['unit']), 'The EDF voltage unit must be uV.')
        total = records*ns[0]; keep = int(math.floor(duration*1000+.5))
        require(abs(keep-duration*1000) < 1e-6 and keep <= total, 'The TXT duration does not fit the EDF.')
        # Decode record blocks without allocating a second complete f64 recording.
        samples = np.empty((130,total), dtype=np.float32)
        gain = (np.array(fields['pmax'],float)-np.array(fields['pmin'],float)) / (np.array(fields['dmax'],float)-np.array(fields['dmin'],float))
        offset = np.array(fields['pmin'],float)-gain*np.array(fields['dmin'],float)
        f.seek(int(h[184:192]))
        for record in range(records):
            raw = np.frombuffer(f.read(int(ns.sum())*2), dtype='<i2')
            require(raw.size == ns.sum(), 'The EDF file is incomplete.')
            samples[:,record*ns[0]:(record+1)*ns[0]] = raw.reshape(130,ns[0])*gain[:,None]+offset[:,None]
    indices = trial_samples(samples[129,:keep], events, physical_events)
    if keep < total:
        require(np.all(samples[:,keep:] == samples[:,-1:]), 'The EDF contains nonconstant trailing samples.')
    return samples[:129,:keep].copy(), indices


def lowpass(order, fc, window=None):
    n = np.arange(-order//2,order//2+1,dtype=float)
    b = np.zeros(order+1); nz = n != 0
    b[nz] = np.sin(2*np.pi*fc*n[nz])/n[nz]; b[~nz] = 2*np.pi*fc
    b *= np.hamming(order+1) if window is None else window
    return b/b.sum()


def centered_filter(data, kernel, progress, label):
    delay = (len(kernel)-1)//2
    for c in range(len(data)):
        x = np.pad(data[c].astype(float),(delay,delay),mode='edge')
        data[c] = signal.fftconvolve(x,kernel,mode='valid').astype(np.float32)
        if c % 8 == 0: progress(label, c+1, len(data))


def find_bad(data):
    jp = []
    for x in data:
        lo, hi = x.min(),x.max()
        require(hi > lo, 'A flat channel prevents probability detection.')
        bins = np.floor((x-lo)/(hi-lo)*np.float32(999)).astype(int)
        bins = np.clip(bins,0,999)
        counts = np.bincount(bins,minlength=1000)
        jp.append(-np.log(counts[bins]/len(x)).sum())
    jp = np.array(jp); trimmed = np.sort(jp)[12:116]
    return np.flatnonzero(np.abs((jp-trimmed.mean())/trimmed.std(ddof=1)) > 2.5)


def interpolate(data, bad, coordinates, progress):
    if len(bad) == 0: return
    good = np.array([i for i in range(129) if i not in bad])
    xyz = np.asarray(coordinates,dtype=float)
    xyz /= np.linalg.norm(xyz,axis=1)[:,None]
    def kernel(target, source):
        ei = 1-np.sqrt(np.sum((target[:,None,:]-source[None,:,:])**2,axis=2))
        g = np.zeros(ei.shape)
        for n in range(1,8): g += (2*n+1)/(n**4*(n+1)**4)*special.eval_legendre(n,ei)
        return g/(4*np.pi)
    gg = kernel(xyz[good],xyz[good]); bg = kernel(xyz[bad],xyz[good])
    a = np.vstack((gg,np.ones((1,len(good)))))
    u,s,vt = np.linalg.svd(a,full_matrices=False)
    inv = (vt.T*(1/s)) @ u.T
    for start in range(0,data.shape[1],4096):
        stop = min(start+4096,data.shape[1]); v = data[good,start:stop]
        mu = v.mean(axis=0,dtype=np.float32)
        centered = (v-mu).astype(np.float32)
        # MATLAB single/double matrix products return single.
        coeff = inv.astype(np.float32) @ np.vstack((centered,np.zeros((1,stop-start),np.float32)))
        for j,c in enumerate(bad):
            data[c,start:stop] = (np.sum(coeff*bg[j,:,None].astype(np.float32),axis=0,dtype=np.float32)+mu)
        if start % (4096*8) == 0: progress('Interpolate channels',stop,data.shape[1])


def prepare(edf_path, log_text, csv_text, coordinates, electrodes=None, conditions=None,
            average=False, recording='', progress=lambda *x: None, checkpoint=None):
    require(recording, 'Enter a recording ID.')
    require(re.fullmatch(r'[A-Za-z0-9_]+',recording), 'Use letters, numbers and underscores in the recording ID.')
    require(electrodes, 'Select at least one electrode.')
    require(conditions, 'Select at least one condition.')
    require(electrodes and len(set(electrodes)) == len(electrodes) and all(re.fullmatch(r'E(?:[1-9]|[1-9][0-9]|1[0-2][0-9])',e) for e in electrodes), 'Select unique electrodes E1–E129.')
    require(conditions and len(set(conditions)) == len(conditions) and all(c in CONDITIONS for c in conditions), 'Select unique conditions.')
    events, labels, duration, physical_events = read_events(log_text,csv_text)
    progress('Read EDF',0,1)
    data, pulse_indices = read_edf(edf_path,duration,events,progress,physical_events=physical_events)
    if checkpoint: checkpoint('import',data)
    # MATLAB promotes the reference matrix to single for this mixed product.
    reference = np.eye(129,dtype=np.float32)
    reference[:,56] -= np.float32(.5); reference[:,99] -= np.float32(.5)
    for start in range(0,data.shape[1],8192):
        data[:,start:start+8192] = reference @ data[:,start:start+8192]
    if checkpoint: checkpoint('reference',data)
    notch = lowpass(1650,58/1000)-lowpass(1650,62/1000); notch[825] += 1
    centered_filter(data,notch,progress,'Filter 57–63 Hz')
    if checkpoint: checkpoint('notch',data)
    band = lowpass(33000,30.05/1000)-lowpass(33000,.05/1000)
    centered_filter(data,band,progress,'Filter 0.1–30 Hz')
    if checkpoint: checkpoint('bandpass',data)
    progress('Check channels',0,1); bad = find_bad(data)
    interpolate(data,bad,coordinates,progress)
    if checkpoint: checkpoint('interpolate',data)
    b = lowpass(130,.225/2,np.kaiser(131,5))
    down = np.empty((129,math.ceil(data.shape[1]/4)),dtype=np.float32)
    for c in range(129):
        down[c] = signal.resample_poly(np.pad(data[c].astype(float),(68,68),mode='edge'),1,4,window=b)[17:-17]
        if c % 8 == 0: progress('Resample to 250 Hz',c+1,129)
    del data
    if checkpoint: checkpoint('resample',down)
    latencies = (pulse_indices-1)/4+1
    starts = np.floor(latencies).astype(int)-51
    require(np.all(starts >= 0) and np.all(starts+250 <= down.shape[1]), 'An epoch exceeds the recording boundary.')
    require(all(np.count_nonzero((latencies >= s+1)&(latencies < s+251)) == 1 for s in starts),
            'An epoch contains more than one event. Review the recording timing.')
    epochs = np.empty((129,250,len(events)),dtype=np.float32,order='F')
    for i,start in enumerate(starts):
        epoch = down[:,start:start+250]
        baseline = epoch[:,:51].astype(float).mean(axis=1,keepdims=True)
        epochs[:,:,i] = (epoch.astype(float)-baseline).astype(np.float32)
    del down
    if checkpoint: checkpoint('epochs',epochs)
    # A double accumulator avoids catastrophic float32 cancellation; final SD is single.
    sd = np.float32(epochs.astype(float).std(ddof=1))
    require(np.isfinite(sd) and sd > 0, 'The global voltage SD is invalid.')
    flags = np.zeros(len(events),dtype=bool)
    for i in range(len(events)):
        normalized = (epochs[:,:,i].astype(float)/float(sd)).astype(np.float32)
        flags[i] = np.any((normalized >= 4.5)|(normalized <= -4.5))
    counts = [{'condition':c,'all_events':labels.count(c),'artifact_flagged':sum(flags[i] for i,x in enumerate(labels) if x==c),
               'exported_trials':sum(not flags[i] for i,x in enumerate(labels) if x==c and c in conditions)} for c in CONDITIONS]
    keep = [i for c in conditions for i,x in enumerate(labels) if x==c and not flags[i]]
    for c in conditions: require(sum(labels[i]==c for i in keep)>=2, 'Condition '+c+' has fewer than two retained trials.')
    ci = [int(e[1:])-1 for e in electrodes]
    outputs = []
    for number,e in enumerate(['AVG_'+'_'.join(electrodes)] if average else electrodes):
        values = epochs[ci][:,:,keep].astype(float).mean(axis=0) if average else epochs[ci[number],:,keep].T.astype(float)
        require(values.shape == (250,len(keep)), 'Prepared matrix dimensions differ.')
        names = [f'{e}__{labels[i]}__trial_event{i+1:06d}' for i in keep]
        filename = 'DDA_'+recording+('' if average or len(electrodes)==1 else '_'+e)+'.csv'
        outputs.append({'name':filename,'columns':names,'matrix':values,'time':np.arange(250)/250})
    progress('Preparation complete',1,1)
    return outputs, counts, {'bad_channels':['E'+str(i+1) for i in bad], 'epochs':len(events),'global_sd':float(sd), 'rejected_events':(np.flatnonzero(flags)+1).tolist()}


def prepared_csv(output):
    buf=io.StringIO(); buf.write(','.join(['time']+output['columns'])+'\n')
    np.savetxt(buf,np.column_stack((output['time'],output['matrix'])),delimiter=',',fmt='%.17g')
    return buf.getvalue()
