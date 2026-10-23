"""Local browser dataset access, selection, and ICA. No network operations."""
import csv
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
    return {k:d[k] for k in ('id','name','columns','rows','rate','duration','start','groups','counts','preparation')}

def register(name, matrix, time, columns, counts=None, preparation=None):
    matrix=np.ascontiguousarray(matrix,dtype=np.float64); time=np.array(time,dtype=float)
    require(matrix.ndim==2 and len(time)==len(matrix) and matrix.shape[1]==len(columns), 'Invalid dataset dimensions.')
    require(len(time)>1 and np.isfinite(matrix).all() and np.isfinite(time).all(), 'Use finite voltage samples.')
    dt=np.diff(time); require(np.all(dt>0) and np.max(abs(dt-np.median(dt)))<max(abs(np.median(dt))*1e-6,1e-10), 'Use a uniform increasing time column.')
    require(len(set(columns))==len(columns),'The channel names must be unique.')
    rate=1/float(np.median(dt)); did=uuid.uuid4().hex
    groups=groups_for(columns)
    if groups:
        require(len({g['electrode'] for g in groups})==1, 'Open one electrode or electrode average per trial file.')
    d={'id':did,'name':name,'matrix':matrix,'time':time,'columns':columns,'rows':len(matrix),'rate':rate,
       'duration':float(time[-1]-time[0]+1/rate),'start':float(time[0]),'groups':groups,
       'counts':counts or [],'preparation':preparation}
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
    return json.dumps(register(name,values,time,columns,meta.get('counts'),meta.get('preparation')))

def prepare_files(config_json, coordinates_json, progress):
    cfg=json.loads(config_json)
    outputs,counts,info=prepare('/input/recording.edf',open('/input/log.txt',encoding='utf-8-sig').read(),
        open('/input/conditions.csv',encoding='utf-8-sig').read(),json.loads(coordinates_json),
        cfg['electrodes'],cfg['conditions'],cfg['average'],cfg['recording'],progress=progress)
    result=[register(o['name'],o['matrix'],o['time'],o['columns'],counts,info) for o in outputs]
    return json.dumps(result,default=int)

def export_dataset(did):
    d=datasets[did]
    return prepared_csv({'columns':d['columns'],'matrix':d['matrix'],'time':d['time']})

def close_dataset(did):
    datasets.pop(did,None)

def preview(did,config_json):
    d=datasets[did];cfg=json.loads(config_json);indices=cfg.get('indices',list(range(min(5,len(d['columns'])))))
    start=max(0,int(cfg.get('start',0)*d['rate']));end=min(d['rows'],int(cfg.get('end',d['duration'])*d['rate'])+1)
    stride=max(1,math.ceil((end-start)/2000));ix=np.arange(start,end,stride)
    return json.dumps({'time':d['time'][ix].tolist(),'names':[d['columns'][i] for i in indices],
                       'values':d['matrix'][ix][:,indices].T.tolist()})

def analysis_spec(did,config_json):
    d=datasets[did];cfg=json.loads(config_json)
    indices=cfg['indices'];require(indices and len(set(indices))==len(indices),'Select channels or trials.')
    require(all(isinstance(i,int) and 0<=i<len(d['columns']) for i in indices),'Invalid channel selection.')
    require(cfg['variants'],'Select an analysis variant.')
    start=max(0,int(math.floor(float(cfg.get('start',0))*d['rate']+1e-6)))
    end=min(d['rows'],int(math.floor(float(cfg.get('end',d['duration']))*d['rate']+1e-6))+1)
    require(end>start,'The end time must follow the start time.')
    wl=int(cfg['window']);step=int(cfg['step']);delays=cfg['delays'];dm=int(cfg['dimension']);nt=int(cfg['nrTau'])
    require(wl>0 and step>0 and dm>0 and cfg['order']>0 and nt>0,'Use positive model and window settings.')
    require(len(delays)>=nt and all(int(t)>0 for t in delays),'Use positive delays for each tau.')
    require(len(cfg['terms'])>=1 and all(int(t)>0 for t in cfg['terms']),'Select positive model term indices.')
    needed=wl+2*dm+max(delays[:nt]);require(end-start>=needed, f'The selected interval needs at least {needed} samples.')
    groups=groups_for(d['columns'],set(indices))
    if groups:
        require(cfg['variants']==['CT'],'Condition trial files require pooled CT. Run other variants on continuous channel files.')
        require(not cfg.get('pairs'),'Condition trial files require pooled trials.')
        for g in groups: require(len(g['indices'])>=2,'Condition '+g['condition']+' needs at least two selected trials.')
    else:
        if any(v in cfg['variants'] for v in ('CT','CD','SY','CCD','SICCD','TRCCD','MVCCD','CCDSTAB')):
            require(len(indices)>=2,'Select at least two channels.')
        groups=[{'electrode':'','condition':'','indices':indices}]
    count=1+(end-start-needed)//step
    centers=[float(d['time'][start])+(dm+max(delays[:nt])+(wl-1)/2+k*step)/d['rate']-float(cfg['eventOffset']) for k in range(count)]
    return json.dumps({'groups':groups,'start':start,'end':end,'centers':centers,'rate':d['rate']})

def analysis_matrix(did,indices_json,start,end):
    d=datasets[did];indices=json.loads(indices_json)
    return np.ascontiguousarray(d['matrix'][int(start):int(end),indices]).ravel()

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
