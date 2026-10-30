"""Local browser dataset access, selection, and ICA. No network operations."""
import csv
import base64
import io
import json
import math
import re
import uuid
import warnings
import numpy as np
from scipy.signal import welch
from scipy.stats import kurtosis
from preparation import prepare, prepared_csv, require

datasets = {}
TRIAL = re.compile(r'^(E[0-9]+|AVG_E[0-9]+(?:_E[0-9]+)*)__([A-Za-z][A-Za-z0-9_-]*)__trial_([A-Za-z0-9_-]+)$')

def groups_for(columns, selected=None):
    groups = {}
    for i,name in enumerate(columns):
        m=TRIAL.fullmatch(name)
        if not m: return []
        if selected is not None and i not in selected: continue
        key=(m[1],m[2]); groups.setdefault(key,[]).append(i)
    return [{'electrode':e,'condition':c,'indices':v} for (e,c),v in groups.items()]

def metadata(d):
    return {k:d[k] for k in ('id','name','columns','rows','rate','duration','start','groups','counts','preparation','electrodes')}

def attach_electrodes(d, electrodes, values):
    expected = 'AVG_'+'_'.join(electrodes)
    require(electrodes and len(set(electrodes)) == len(electrodes) and
            d['groups'] and all(g['electrode'] == expected for g in d['groups']),
            'The individual electrodes do not match the averaged file.')
    values = np.ascontiguousarray(values, dtype=np.float32)
    require(values.shape == (len(electrodes),d['rows'],len(d['columns'])) and np.isfinite(values).all(),
            'The individual electrode data has invalid dimensions or samples.')
    require(np.allclose(values.astype(float).mean(axis=0), d['matrix'], rtol=1e-10, atol=1e-12),
            'The individual electrodes do not reproduce the saved average.')
    d['electrodes'] = list(electrodes)
    d['electrode_data'] = values


def register(name, matrix, time, columns, counts=None, preparation=None, electrodes=None, electrode_data=None):
    matrix=np.ascontiguousarray(matrix,dtype=np.float64); time=np.array(time,dtype=float)
    require(matrix.ndim==2 and len(time)==len(matrix) and matrix.shape[1]==len(columns), 'Invalid dataset dimensions.')
    require(len(time)>1 and np.isfinite(matrix).all() and np.isfinite(time).all(), 'Use finite voltage samples.')
    dt=np.diff(time); require(np.all(dt>0) and np.max(abs(dt-np.median(dt)))<max(abs(np.median(dt))*1e-6,1e-10), 'Use a uniform increasing time column.')
    require(len(set(columns))==len(columns),'The channel names must be unique.')
    rate=1/float(np.median(dt))
    if abs(rate-round(rate,8)) < max(1,abs(rate))*1e-10: rate=round(rate,8)
    did=uuid.uuid4().hex
    groups=groups_for(columns)
    if groups:
        require(len({g['electrode'] for g in groups})==1, 'Open one electrode or electrode average per trial file.')
    d={'id':did,'name':name,'matrix':matrix,'time':time,'columns':columns,'rows':len(matrix),'rate':rate,
       'duration':float(time[-1]-time[0]+1/rate),'start':float(time[0]),'groups':groups,
       'counts':counts or [],'preparation':preparation,'electrodes':[]}
    if electrode_data is not None:
        attach_electrodes(d, electrodes or [], electrode_data)
    datasets[did]=d
    return metadata(d)

def open_csv(name,text,rate=250,metadata_json='{}'):
    lines=list(csv.reader(io.StringIO(text.lstrip('\ufeff'))))
    require(len(lines)>2,'The CSV file has too few rows.')
    try: [float(v) for v in lines[0]]; has_header=False
    except ValueError: has_header=True
    header=lines[0] if has_header else ['Channel '+str(i+1) for i in range(len(lines[0]))]
    try: values=np.array(lines[1:] if has_header else lines,dtype=float)
    except ValueError: raise ValueError('The CSV must contain a rectangular numeric matrix.')
    require(values.ndim==2 and values.shape[1]==len(header),'The CSV columns do not match its header.')
    if header[0].strip().lower() in ('time','t','seconds','time_s'):
        time=values[:,0];values=values[:,1:];columns=header[1:]
    else: time=np.arange(len(values))/float(rate);columns=header
    meta=json.loads(metadata_json)
    info=register(name,values,time,columns,meta.get('counts'),meta.get('preparation'))
    if meta.get('electrode_data') is not None:
        try:
            stored=meta['electrode_data']
            require(stored.get('encoding') == 'f32le-base64', 'The individual electrode data format is unsupported.')
            electrodes=stored['electrodes']
            raw=base64.b64decode(stored['values'],validate=True)
            require(len(raw) == len(electrodes)*len(time)*len(columns)*4,
                    'The saved individual electrode data is incomplete.')
            data=np.frombuffer(raw,dtype='<f4').reshape(len(electrodes),len(time),len(columns))
            attach_electrodes(datasets[info['id']],electrodes,data)
        except Exception:
            datasets.pop(info['id'],None)
            raise
        info=metadata(datasets[info['id']])
    return json.dumps(info)

def prepare_files(config_json, coordinates_json, progress):
    cfg=json.loads(config_json)
    outputs,counts,info=prepare('/input/recording.edf',open('/input/log.txt',encoding='utf-8-sig').read(),
        open('/input/conditions.csv',encoding='utf-8-sig').read(),json.loads(coordinates_json),
        cfg['electrodes'],cfg['conditions'],cfg['average'],cfg['recording'],progress=progress)
    result=[register(o['name'],o['matrix'],o['time'],o['columns'],counts,info,
                     o.get('electrodes'),o.get('electrode_data')) for o in outputs]
    return json.dumps(result,default=int)


def export_electrodes(did):
    d=datasets[did]
    if not d['electrodes']: return 'null'
    return json.dumps({'encoding':'f32le-base64','electrodes':d['electrodes'],
                      'values':base64.b64encode(d['electrode_data'].astype('<f4',copy=False).tobytes()).decode('ascii')})

def export_dataset(did):
    d=datasets[did]
    return prepared_csv({'columns':d['columns'],'matrix':d['matrix'],'time':d['time']})

def close_dataset(did):
    datasets.pop(did,None)

def preview(did,config_json):
    d=datasets[did];cfg=json.loads(config_json);indices=cfg.get('indices',list(range(min(5,len(d['columns'])))))
    require(len(set(indices))==len(indices) and all(type(i) is int and 0<=i<len(d['columns']) for i in indices),
            'Invalid waveform trial selection.')
    mode=cfg.get('mode','separate')
    require(mode in ('single','mean','separate'), 'Select a waveform view.')
    start=max(0,int(cfg.get('start',0)*d['rate']));end=min(d['rows'],int(cfg.get('end',d['duration'])*d['rate'])+1)
    require(end>start, 'The end time must follow the start time.')
    stride=max(1,math.ceil((end-start)/2000));ix=np.arange(start,end,stride)
    selected=cfg.get('electrodes')
    source=d['groups'][0]['electrode'] if d['groups'] else ''
    if selected is not None:
        require(d['electrodes'], 'Individual electrode data is not saved. Upload the recording again.')
        require(len(set(selected))==len(selected) and all(e in d['electrodes'] for e in selected),
                'Invalid waveform electrode selection.')
        if not selected or not indices:
            return json.dumps({'time':[],'names':[],'values':[],'source':'','trials':len(indices)})
        # Canonical source order keeps the label stable when checkboxes are toggled.
        selected=[e for e in d['electrodes'] if e in selected]
        source=selected[0] if len(selected)==1 else 'AVG_'+'_'.join(selected)
        if len(selected)==len(d['electrodes']):
            matrix=d['matrix'][np.ix_(ix,indices)]
        else:
            ei=[d['electrodes'].index(e) for e in selected]
            matrix=d['electrode_data'][np.ix_(ei,ix,indices)].astype(float).mean(axis=0)
    else:
        matrix=d['matrix'][np.ix_(ix,indices)]
    names=[d['columns'][i] for i in indices]
    if selected is not None:
        names=[source+'__'+name.split('__',1)[1] for name in names]
    if mode=='mean' and indices:
        groups=groups_for(d['columns'],set(indices))
        require(groups, 'Trial averaging requires condition trial data.')
        # Keep experimental conditions separate, even if a caller requests more than one.
        values=[];names=[]
        for g in groups:
            positions=[indices.index(i) for i in g['indices']]
            values.append(matrix[:,positions].mean(axis=1).tolist())
            names.append(g['condition']+' · Mean of '+str(len(positions))+' trials')
    else:
        values=matrix.T.tolist()
    return json.dumps({'time':d['time'][ix].tolist(),'names':names,'values':values,
                       'source':source,'trials':len(indices)})

def analysis_spec(did,config_json):
    d=datasets[did];cfg=json.loads(config_json)
    indices=cfg['indices'];require(indices and len(set(indices))==len(indices),'Select channels or trials.')
    require(all(isinstance(i,int) and 0<=i<len(d['columns']) for i in indices),'Invalid channel selection.')
    require(cfg['variants'],'Select an analysis variant.')
    if 'CT' in cfg['variants'] and not cfg.get('pairs'):
        require(cfg['variants']==['CT'],'Run pooled CT separately from other variants.')
    if 'SY' in cfg['variants']:
        require(len(indices)%2==0,'SY requires an even number of selected channels for adjacent pairs.')
    start=max(0,int(math.floor(float(cfg.get('start',0))*d['rate']+1e-6)))
    end=min(d['rows'],int(math.floor(float(cfg.get('end',d['duration']))*d['rate']+1e-6))+1)
    require(end>start,'The end time must follow the start time.')
    wl=int(cfg['window']);step=int(cfg['step']);delays=cfg['delays'];dm=int(cfg['dimension']);nt=int(cfg['nrTau'])
    require(wl>0 and step>0 and dm>0 and cfg['order']>0 and nt>0,'Use positive model and window settings.')
    require(len(delays)>=nt and all(int(t)>0 for t in delays),'Use positive delays for each tau.')
    require(len(cfg['terms'])>=1 and all(int(t)>0 for t in cfg['terms']),'Select positive model term indices.')
    needed=wl+2*dm+max(delays[:nt]);require(end-start>=needed, f'The selected interval needs at least {needed} samples.')
    groups=groups_for(d['columns'],set(indices))
    electrode_averaging=cfg.get('electrodeAveraging','signal')
    require(electrode_averaging in ('signal','coefficients'),'Choose an electrode averaging method.')
    analysis_electrodes=[]
    if groups:
        require(cfg['variants']==['CT'],'Condition trial files require pooled CT. Run other variants on continuous channel files.')
        require(not cfg.get('pairs'),'Condition trial files require pooled trials.')
        for g in groups: require(len(g['indices'])>=2,'Condition '+g['condition']+' needs at least two selected trials.')
        if electrode_averaging == 'coefficients':
            analysis_electrodes=d['electrodes']
            require(analysis_electrodes or not groups[0]['electrode'].startswith('AVG_') or
                    len(groups[0]['electrode'].split('_')) == 2,
                    'This file contains an EEG average only. Prepare the recording again or open a full session with individual electrodes to average DDA results after fitting.')
    else:
        if any(v in cfg['variants'] for v in ('CT','CD','SY','CCD','SICCD','TRCCD','MVCCD','CCDSTAB')):
            require(len(indices)>=2,'Select at least two channels.')
        groups=[{'electrode':'','condition':'','indices':indices}]
    count=1+(end-start-needed)//step
    # Preparation supplies the default. An onset entered by the user takes
    # precedence, including zero, and remains part of the saved run settings.
    prep=d.get('preparation')
    event_offset=float(cfg['eventOffset'] if cfg.get('eventOffsetManual') or not prep
                       else prep.get('event_offset_seconds',0.2))
    require(math.isfinite(event_offset),'Use a finite event onset in seconds.')
    centers=[float(d['time'][start])+(dm+max(delays[:nt])+(wl-1)/2+k*step)/d['rate']-event_offset for k in range(count)]
    return json.dumps({'groups':groups,'start':start,'end':end,'centers':centers,'rate':d['rate'],
                       'event_offset_seconds':event_offset,'analysis_electrodes':analysis_electrodes,
                       'epoch_time_bounds_seconds':[float(d['time'][0])-event_offset,
                                                    float(d['time'][-1])+1/d['rate']-event_offset]})

def analysis_matrix(did,indices_json,start,end,electrode=None):
    d=datasets[did];indices=json.loads(indices_json)
    source=d['matrix']
    if electrode is not None:
        require(electrode in d['electrodes'],'The selected electrode is not retained in this file.')
        source=d['electrode_data'][d['electrodes'].index(electrode)]
    return np.ascontiguousarray(source[int(start):int(end),indices],dtype=np.float64).ravel()

def run_ica(did,config_json):
    from sklearn.decomposition import FastICA
    d=datasets[did];cfg=json.loads(config_json);indices=cfg['indices']
    require(len(indices)>=2,'Select at least two channels for ICA.')
    start=max(0,int(cfg['start']*d['rate']));end=min(d['rows'],int(cfg['end']*d['rate'])+1)
    x=d['matrix'][start:end,indices].copy();require(len(x)>=4,'ICA needs at least four samples.')
    if cfg.get('centering',True):x-=x.mean(axis=0)
    n=min(int(cfg['components']),len(indices),len(x))
    model=FastICA(n_components=n,whiten='unit-variance' if cfg.get('whitening',True) else False,
                  max_iter=int(cfg['maxIterations']),tol=float(cfg['tolerance']),random_state=0)
    with warnings.catch_warnings(record=True) as caught:
        sources=model.fit_transform(x)
    components=[]
    variances=np.var(sources,axis=0);total=float(variances.sum()) or 1
    for i in range(sources.shape[1]):
        freq,power=welch(sources[:,i],fs=d['rate'],nperseg=min(256,len(x)))
        components.append({'id':i+1,'series':sources[::max(1,math.ceil(len(x)/768)),i].tolist(),
          'spatial':model.mixing_[:,i].tolist(),'kurtosis':float(kurtosis(sources[:,i],fisher=False,bias=False)),
          'variance':float(variances[i]/total),'frequencies':freq.tolist(),'power':power.tolist()})
    return json.dumps({'name':d['name'],'channels':[d['columns'][i] for i in indices],
                       'components':components,'warnings':[str(w.message) for w in caught]})
