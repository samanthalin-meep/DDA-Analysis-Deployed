function outputRoot = DDA_prep(cfg)
% DDA_PREP  Prepare EEG trials for DDALAB Pooled using EEGLAB & ERPLAB
% When DDA_prep and select a folder with one EDF, one TXT log and one CSV
% containing sec_time and label. Supports 1000-Hz HydroCel E1-E129 + Status.
% Choose a Recording ID, electrodes and conditions. Electrodes can be
% averaged within each trial; trials remain separate.
% Saves data and counts CSVs inside a new Recording ID folder.
% For automated runs, pass cfg using the fields listed below.

if nargin == 0
    dataFolder = uigetdir(fileparts(mfilename('fullpath')), ...
        '1. Choose DATA folder (one EDF, one TXT log, one conditions CSV)');
    if isequal(dataFolder,0), outputRoot=''; return; end
    cfg=find_recording_files(dataFolder);
    cfg.projectRoot=find_preparation_root(dataFolder);
    selected=choose_preparation_groups('I1_R3');
    if isempty(selected), outputRoot=''; return; end
    cfg.recordingID=selected.recordingID;
    cfg.electrodes=selected.electrodes;
    cfg.conditions=selected.conditions;
    cfg.averageElectrodes=false;
    if numel(cfg.electrodes)>1
        mode=confirm_electrode_average(numel(cfg.electrodes));
        if isempty(mode), outputRoot=''; return; end
        cfg.averageElectrodes=mode;
    end
    cfg.outputRoot=fullfile(dataFolder,cfg.recordingID);
    choice=questdlg(sprintf(['Use the inherited I1_R3 recipe?\n\n' ...
        'E57/E100 reference; 57-63 Hz stop; 0.1-30 Hz pass\n' ...
        'Probability channel threshold 2.5; spherical interpolation\n' ...
        '250 Hz; epochs -200 to +800 ms; baseline -200 to 0 ms\n' ...
        'Artifact threshold +/-4.5 global SD (permissive)\n\n' ...
        'Only for the same recording format and approved protocol.\n' ...
        'New output folder:\n%s'],cfg.outputRoot), ...
        '3. Review preparation settings','Run preparation','Cancel','Cancel');
    if ~strcmp(choice,'Run preparation'), outputRoot=''; return; end
end

required={'projectRoot','edfFile','acquisitionLog','eventCSV','recordingID','outputRoot','electrodes','conditions'};
assert(all(isfield(cfg,required)),'Missing configuration fields; see help DDA_prep.');
if ~isfield(cfg,'averageElectrodes'), cfg.averageElectrodes=false; end
assert(islogical(cfg.averageElectrodes) && isscalar(cfg.averageElectrodes),'averageElectrodes must be true or false.');
assert(~isempty(regexp(cfg.recordingID,'^[A-Za-z0-9_]+$','once')),'Unsafe recording ID.');
assert(~isfolder(cfg.outputRoot) && ~isfile(cfg.outputRoot),'This Recording ID folder already exists. Use a different Recording ID or choose another parent folder.');
assert(isfile(cfg.edfFile) && isfile(cfg.acquisitionLog) && isfile(cfg.eventCSV),'An input file is missing.');
cfg.projectRoot=find_preparation_root(cfg.projectRoot);
outputRoot=cfg.outputRoot; mkdir(outputRoot);
stamp('BEGIN');
fprintf('Recording: %s\nEDF: %s\nLog: %s\nConditions table: %s\nOutput: %s\n', ...
    cfg.recordingID,cfg.edfFile,cfg.acquisitionLog,cfg.eventCSV,outputRoot);
fprintf('Electrodes: %s; average: %d\nConditions: %s\n', ...
    strjoin(cfg.electrodes,', '),cfg.averageElectrodes,strjoin(cfg.conditions,', '));
% Restore the original MATLAB path when preparation ends.
oldPath=path; cleanupPath=onCleanup(@() path(oldPath));
restoredefaultpath;
addpath(fullfile(cfg.projectRoot,'eeglab2026.0.0')); eeglab nogui;
addpath(genpath(fullfile(cfg.projectRoot,'erplab12.20')));
fprintf('MATLAB %s; toolboxes: %s\n',version,cfg.projectRoot);

stamp('1. Parse acquisition log and validate matching condition table');
logText=fileread(cfg.acquisitionLog);
lines=splitlines(string(logText));
% Read message time, EEG event time and event code from each log entry.
pattern='^(\d+):(\d+):(\d+)\.(\d+)\.(\d+): Event: (\d+):(\d+):(\d+)\.(\d+), ([^,]+),';
logger=[]; payload=[]; code=strings(0,1);
for k=1:numel(lines)
    t=regexp(char(lines(k)),pattern,'tokens','once');
    if isempty(t), continue; end
    n=str2double(t(1:9));
    logger(end+1,1)=n(1)*3600+n(2)*60+n(3)+n(4)/1000+n(5)/1e6;
    payload(end+1,1)=n(6)*3600+n(7)*60+n(8)+n(9)/1000;
    code(end+1,1)=string(t{10});
end
N=numel(payload); assert(N>=2,'No usable acquisition Event messages.');
labels=readtable(cfg.eventCSV,TextType='string');
assert(all(ismember({'sec_time','label'},labels.Properties.VariableNames)),'Labels CSV requires sec_time and label columns.');
assert(height(labels)==N,'Log and labels CSV have different event counts.');
assert(max(abs(labels.sec_time-logger))<1e-8,'CSV times do not match acquisition message times; do not align by row count alone.');
[names,binDescriptions]=condition_definitions();
[ok,codes]=ismember(cellstr(labels.label),names); assert(all(ok),'Unknown condition label; protocol mapping must be reviewed.');
assert(all(ismember(code,["STRT","stim"])) && all((code=="STRT")== (labels.label=="start")),'Acquisition event code/label mismatch.');
assert(all(ismember(cfg.conditions,names)) && numel(unique(cfg.conditions))==numel(cfg.conditions),'Unknown or repeated selected condition.');
[bdf,cleanupBins]=create_temporary_bin_file(binDescriptions);
dur=regexp(logText,'Recording duration ([0-9.]+), record duration','tokens');
assert(numel(dur)==1,'Expected one continuous acquisition duration.'); duration=str2double(dur{1}{1});
fslog=regexp(logText,'Sampling Rate:\s*(\d+) s/s','tokens','once');
assert(~isempty(fslog) && str2double(fslog{1})==1000,'This verified recipe supports 1000-Hz source recordings only.');

stamp('2. Import actual EDF voltage samples; verify physical Status pulses');
EEG=pop_biosig(cfg.edfFile,'importevent','off','importannot','off','rmeventchan','off','overflow','off','uncalibrated','off');
assert(EEG.trials==1 && EEG.srate==1000 && EEG.nbchan==130,'Expected continuous 1000-Hz 130-channel EDF.');
expected=[cellstr(compose('E%d',1:129)) {'Status'}];
assert(isequal({EEG.chanlocs.labels},expected),'Channel names/order differ from verified HydroCel layout.');
keepN=round(duration*EEG.srate); assert(abs(keepN-duration*EEG.srate)<1e-6 && keepN<=EEG.pnts,'Duration does not fit the sample grid/EDF.');
status=double(EEG.data(130,1:keepN)); u=unique(status);
candidates={};
for j=1:numel(u)
    idx=find(status==u(j));
    if numel(idx)==N && all(diff(idx)>1) && max(abs(idx(:)-payload*EEG.srate))<1e-6
        candidates{end+1}=idx(:);
    end
end
assert(numel(candidates)==1,'Cannot prove one-to-one physical Status pulse alignment; stop for timing review.');
sample1=candidates{1};
if keepN<EEG.pnts
    assert(all(all(EEG.data(:,keepN+1:end)==EEG.data(:,end))),'Trailing samples are not constant padding.');
end
EEG.setname=[cfg.recordingID ' EDF continuous original import'];
EEG.data=single(EEG.data); % Keep EEG samples in single precision.
event_id=(1:N)';
T=table(codes,sample1,zeros(N,1),event_id,labels.label,labels.sec_time,sample1, ...
 'VariableNames',{'type','latency','duration','source_event_id','label','original_log_seconds','source_sample_one_based'});
EEG=pop_select(EEG,'point',[1 keepN]); EEG=pop_select(EEG,'channel',1:129);
L=readlocs(fullfile(cfg.projectRoot,'eeglab2026.0.0','functions','supportfiles','channel_location_files','philips_neuro','GSN-HydroCel-129.sfp'));
L(strcmp({L.labels},'Cz')).labels='E129'; [ok,ii]=ismember({EEG.chanlocs.labels},{L.labels}); assert(all(ok)); EEG.chanlocs=L(ii);
assert(all(ismember(cfg.electrodes,{EEG.chanlocs.labels})) && numel(unique(cfg.electrodes))==numel(cfg.electrodes),'Unknown or repeated electrode.');
EEG.event=table2struct(T); EEG.urevent=[]; EEG=eeg_checkset(EEG,'eventconsistency');

stamp('3. Reference and filter with the existing project recipe');
EEG=pop_reref(EEG,[57 100],'keepref','on'); EEG=makebins(EEG,bdf);
EEG.data=single(EEG.data);
EEG=pop_eegfiltnew(EEG,'locutoff',57,'hicutoff',63,'revfilt',1,'usefftfilt',0);
EEG=pop_eegfiltnew(EEG,'locutoff',0.1,'hicutoff',30,'usefftfilt',0);
EEG.data=single(EEG.data);

stamp('4. Interpolate, resample and rebuild EVENTLIST at 250 Hz');
[~,bad]=pop_rejchan(EEG,'elec',1:EEG.nbchan,'measure','prob','threshold',2.5,'norm','on');
fprintf('Interpolated %d channels: %s\n',numel(bad),strjoin({EEG.chanlocs(bad).labels},', '));
EEG=eeg_interp(EEG,bad);
EEG=pop_resample(EEG,250); EEG=eeg_checkset(EEG); before=[EEG.event.latency];
EEG=makebins(EEG,bdf); assert(max(abs([EEG.event.latency]-before))<1e-6,'EVENTLIST changed resampled latencies.');
% Check that every trial fits inside the recording.
epochStart=floor(before(:))-50;
assert(all(epochStart>=1 & epochStart+250<=EEG.pnts+1),'An epoch would exceed recording boundaries.');
EEG.data=single(EEG.data);

stamp('5. Epoch, baseline-correct and flag artifacts without averaging');
EEG=pop_epochbin(EEG,[-200 800],[-200 0]); EEG=eeg_checkset(EEG);
assert(EEG.srate==250 && EEG.pnts==250 && EEG.trials==N && numel(EEG.event)==N,'Unexpected epoch count or overlapping events; review before export.');
assert(isequal([EEG.event.source_event_id],1:N),'Event order changed during epoching.');
% Normalize only to flag artifacts, then restore the original voltages.
holdData=EEG.data; globalSD=std(reshape(holdData,[],1)); assert(isfinite(globalSD) && globalSD>0);
EEG.data=double(holdData)/double(globalSD); EEG=eeg_checkset(EEG);
EEG=pop_artextval(EEG,'Channel',1:EEG.nbchan,'Flag',[1 2],'LowPass',-1,'Threshold',[-4.5 4.5],'Twindow',[1000*EEG.xmin 1000*EEG.xmax]);
EEG=pop_syncroartifacts(EEG,'Direction','eeglab2erplab'); EEG.data=holdData; clear holdData;
EEG.setname=[cfg.recordingID ' all epochs artifact flagged uV'];
EEG.data=single(EEG.data);
artifactFlag=logical(EEG.reject.rejmanual(:));
included=ismember(labels.label,string(cfg.conditions)) & ~artifactFlag;

stamp('6. Export only the selected data CSVs and condition counts');
export_grouped_trials(EEG,event_id,labels.label,included,cfg.electrodes,cfg.conditions,cfg.recordingID,outputRoot,cfg.averageElectrodes);
countRows=table;
for d=1:numel(names)
 ix=labels.label==string(names{d}); countRows=[countRows;table(string(names{d}),sum(ix),sum(ix & artifactFlag),sum(ix & included),'VariableNames',{'condition','all_events','artifact_flagged','exported_trials'})];
end
countFile=fullfile(outputRoot,['DDA_' cfg.recordingID '_Counts.csv']);
assert(~isfile(countFile),'Counts file already exists; choose a new output folder.');
writetable(countRows,countFile);
restoredCounts=readtable(countFile,TextType='string');
assert(isequal(restoredCounts,countRows),'Condition counts changed on CSV roundtrip.');
stamp('PREPARATION COMPLETE - all trial CSVs reopened and checked'); disp(countRows);
end

function projectRoot=find_preparation_root(parent)
% Find EEGLAB/ERPLAB beside the script or inside programs.
candidates={parent};
here=fileparts(mfilename('fullpath'));
while ~isempty(here)
    candidates{end+1}=here;
    up=fileparts(here); if strcmp(up,here), break; end
    here=up;
end
candidates{end+1}=fullfile(getenv('HOME'),'Desktop','Comstock');
for k=1:numel(candidates)
    roots={candidates{k},fullfile(candidates{k},'programs')};
    for j=1:numel(roots)
        root=roots{j};
        if isfile(fullfile(root,'eeglab2026.0.0','eeglab.m')) && ...
                isfolder(fullfile(root,'erplab12.20'))
            projectRoot=root; return;
        end
    end
end
error('Cannot find EEGLAB/ERPLAB. Keep eeglab2026.0.0 and erplab12.20 beside this script, or in its programs folder.');
end

function [names,descriptions,selectable]=condition_definitions()
% CONDITIONS: each row = CSV label, ERPLAB name, show in selection window.
% Match CSV labels exactly. true shows a checkbox; false hides it.
% Row order sets the event codes (1, 2, ...) used by ERPLAB.
definitions={ ...
    'control', 'miControl',       true; ...
    'exp1',    'maExp1',          true; ...
    'exp2',    'mimiExp2',        true; ...
    'exp3',    'mommaExp3',       true; ...
    'exp4',    'mommashereExp4',  true; ...
    'exp5',    'mommasreheExp5',  true; ...
    'reject',  'miReject',        false; ...
    'start',   'sessionStart',    false};
names=definitions(:,1)';
descriptions=definitions(:,2)';
selectable=cell2mat(definitions(:,3))';
end

function [bdf,cleanupBins]=create_temporary_bin_file(descriptions)
% Write ERPLAB's condition rules to a temporary file, deleted on exit.
bdf=[tempname '.txt'];
cleanupBins=onCleanup(@() remove_temporary_bin_file(bdf));
fid=fopen(bdf,'w'); assert(fid>=0,'Cannot create the temporary bin definition.');
cleanupFile=onCleanup(@() fclose(fid));
for k=1:numel(descriptions)
    fprintf(fid,'Bin %d\n%s\n.{%d}\n\n',k,descriptions{k},k);
end
clear cleanupFile;
end

function remove_temporary_bin_file(bdf)
if isfile(bdf), delete(bdf); end
end

function files=find_recording_files(dataFolder)
% Require one EDF, TXT and CSV directly in the selected folder.
assert(isfolder(dataFolder),'Selected data folder does not exist.');
listing=dir(dataFolder);
listing=listing(~[listing.isdir]);
extensions={'.edf','.txt','.csv'};
roles={'continuous EEG recording','EEG acquisition log','condition-label table'};
fields={'edfFile','acquisitionLog','eventCSV'};
files=struct();
for k=1:numel(extensions)
    matches=listing(endsWith({listing.name},extensions{k},'IgnoreCase',true));
    if isempty(matches)
        error('DDA_prep:MissingInput', ...
            'Data folder must contain exactly one %s file for the %s. Found none in:\n%s', ...
            extensions{k},roles{k},dataFolder);
    elseif numel(matches)>1
        error('DDA_prep:MultipleInputs', ...
            'Data folder must contain exactly one %s file for the %s. Found %d:\n%s\nFolder: %s', ...
            extensions{k},roles{k},numel(matches),strjoin({matches.name},', '),dataFolder);
    end
    files.(fields{k})=fullfile(dataFolder,matches.name);
end
end
function EEG=makebins(EEG,bdf)
EEG=pop_creabasiceventlist(EEG,'AlphanumericCleaning','on','BoundaryNumeric',{-99},'BoundaryString',{'boundary'});
EEG=pop_binlister(EEG,'BDF',bdf,'IndexEL',1,'SendEL2','EEG','Voutput','EEG');
end
function stamp(message)
fprintf('\n[%s] %s\n',char(datetime('now','TimeZone','local','Format','yyyy-MM-dd HH:mm:ss XXX')),message);
end

function close_preparation_dialog(f)
if isvalid(f), delete(f); end
end

function selected=choose_preparation_groups(defaultID)
% Build the recording, electrode and condition selection window.
selected=[];
f=uifigure('Name','2. Choose recording and groups','Tag','PreparationGroups', ...
    'Position',[100 100 820 700],'Theme','light','Color',[1 1 1], ...
    'WindowStyle','modal','CloseRequestFcn',@cancel);
cleanup=onCleanup(@() close_preparation_dialog(f));
g=uigridlayout(f,[8 2],'RowHeight',{24,36,36,'1x',28,68,28,40}, ...
    'ColumnWidth',{'3x','2x'},'Padding',[20 18 20 18], ...
    'RowSpacing',10,'ColumnSpacing',24,'BackgroundColor',[1 1 1]);
label=uilabel(g,'Text','Recording ID','FontSize',15,'FontColor',[0 0 0]);
label.Layout.Row=1; label.Layout.Column=[1 2];
recording=uieditfield(g,'text','Value',defaultID,'Tag','RecordingID', ...
    'FontSize',16,'FontColor',[0 0 0],'BackgroundColor',[1 1 1], ...
    'ValueChangedFcn',@refresh);
recording.Layout.Row=2; recording.Layout.Column=[1 2];

eh=uigridlayout(g,[1 2],'ColumnWidth',{'1x',100},'Padding',[0 0 0 0], ...
    'BackgroundColor',[1 1 1]); eh.Layout.Row=3; eh.Layout.Column=1;
uilabel(eh,'Text','Electrodes','FontSize',16,'FontWeight','bold','FontColor',[0 0 0]);
uibutton(eh,'Text','Check all','Tag','CheckAllElectrodes','FontSize',14, ...
    'ButtonPushedFcn',@(~,~) setAll('electrodes',true));
ch=uigridlayout(g,[1 2],'ColumnWidth',{'1x',100},'Padding',[0 0 0 0], ...
    'BackgroundColor',[1 1 1]); ch.Layout.Row=3; ch.Layout.Column=2;
uilabel(ch,'Text','Conditions','FontSize',16,'FontWeight','bold','FontColor',[0 0 0]);
uibutton(ch,'Text','Check all','Tag','CheckAllConditions','FontSize',14, ...
    'ButtonPushedFcn',@(~,~) setAll('conditions',true));

et=uitree(g,'checkbox','Tag','ElectrodeChecks','FontSize',15, ...
    'FontColor',[0 0 0],'BackgroundColor',[1 1 1]);
et.Layout.Row=4; et.Layout.Column=1;
en=gobjects(1,129);
for k=1:129, en(k)=uitreenode(et,'Text',sprintf('E%d',k)); end
et.CheckedNodes=en(129);
ct=uitree(g,'checkbox','Tag','ConditionChecks','FontSize',15, ...
    'FontColor',[0 0 0],'BackgroundColor',[1 1 1]);
ct.Layout.Row=4; ct.Layout.Column=2;
[allNames,~,selectable]=condition_definitions(); names=allNames(selectable);
cn=gobjects(1,numel(names));
for k=1:numel(names), cn(k)=uitreenode(ct,'Text',names{k}); end
ct.CheckedNodes=cn;
es=uilabel(g,'Tag','ElectrodeSummary','FontSize',13,'FontColor',[0 0 0]);
es.Layout.Row=5; es.Layout.Column=1;
cs=uilabel(g,'Tag','ConditionSummary','FontSize',13,'FontColor',[0 0 0]);
cs.Layout.Row=5; cs.Layout.Column=2;
electrodeNames=uitextarea(g,'Tag','SelectedElectrodeNames','Editable','off', ...
    'WordWrap','on','FontSize',13,'FontColor',[0 0 0],'BackgroundColor',[1 1 1]);
electrodeNames.Layout.Row=6; electrodeNames.Layout.Column=1;
errorLabel=uilabel(g,'Text','','Tag','SelectionError','FontSize',13, ...
    'FontColor',[0.65 0 0]); errorLabel.Layout.Row=7; errorLabel.Layout.Column=[1 2];
buttons=uigridlayout(g,[1 4],'ColumnWidth',{110,110,'1x',110}, ...
    'Padding',[0 0 0 0],'BackgroundColor',[1 1 1]);
buttons.Layout.Row=8; buttons.Layout.Column=[1 2];
uibutton(buttons,'Text','Clear electrodes','Tag','ClearElectrodes','FontSize',13, ...
    'ButtonPushedFcn',@(~,~) setAll('electrodes',false));
uibutton(buttons,'Text','Clear conditions','Tag','ClearConditions','FontSize',13, ...
    'ButtonPushedFcn',@(~,~) setAll('conditions',false));
back=uibutton(buttons,'Text','Cancel','Tag','CancelSelection','FontSize',14, ...
    'ButtonPushedFcn',@cancel); back.Layout.Column=3;
go=uibutton(buttons,'Text','Continue','Tag','ContinueSelection','FontSize',14, ...
    'ButtonPushedFcn',@accept); go.Layout.Column=4;
et.CheckedNodesChangedFcn=@refresh; ct.CheckedNodesChangedFcn=@refresh;
refresh(); drawnow; scroll(et,en(129)); uiwait(f);
clear cleanup;

    function setAll(which,value)
        if strcmp(which,'electrodes'), tree=et; nodes=en; else, tree=ct; nodes=cn; end
        if value, tree.CheckedNodes=nodes; else, tree.CheckedNodes=[]; end
        refresh();
    end
    function refresh(varargin)
        ec=numel(et.CheckedNodes); cc=numel(ct.CheckedNodes);
        if ec==1, es.Text='1 electrode selected';
        else, es.Text=sprintf('%d electrodes selected',ec); end
        if ec==0, electrodeNames.Value={''};
        else, electrodeNames.Value={strjoin({et.CheckedNodes.Text},', ')}; end
        cs.Text=sprintf('%d of %d conditions selected',cc,numel(names));
        errorLabel.Text=''; go.Enable='on';
        if isempty(regexp(strtrim(recording.Value),'^[A-Za-z0-9_]+$','once'))
            errorLabel.Text='Recording ID: use letters, numbers and underscores.';
        elseif ec==0, errorLabel.Text='Check at least one electrode.';
        elseif cc==0, errorLabel.Text='Check at least one condition.';
        end
        if ~isempty(errorLabel.Text), go.Enable='off'; end
    end
    function accept(varargin)
        refresh(); if strcmp(go.Enable,'off'), return; end
        selected=struct('recordingID',strtrim(recording.Value), ...
            'electrodes',{{et.CheckedNodes.Text}},'conditions',{{ct.CheckedNodes.Text}});
        uiresume(f);
    end
    function cancel(varargin)
        selected=[]; uiresume(f);
    end
end

function average=confirm_electrode_average(count)
% Continue averages the electrodes; Make separate keeps each one.
if count<=1, average=false; return; end
average=[];
f=uifigure('Name','Electrode export','Tag','ElectrodeAverageChoice', ...
    'Position',[180 180 540 220],'Theme','light','Color',[1 1 1], ...
    'WindowStyle','modal','CloseRequestFcn',@cancel,'WindowKeyPressFcn',@key);
cleanup=onCleanup(@() close_preparation_dialog(f));
g=uigridlayout(f,[2 2],'RowHeight',{'1x',40},'ColumnWidth',{'1x','1x'}, ...
    'Padding',[24 20 24 20],'RowSpacing',20,'BackgroundColor',[1 1 1]);
message=uilabel(g,'Text',sprintf(['The %d selected electrodes will be averaged.\n\n' ...
    'Each electrode gets equal weight within each trial.'],count), ...
    'WordWrap','on','FontSize',16,'FontColor',[0 0 0]);
message.Layout.Row=1; message.Layout.Column=[1 2];
uibutton(g,'Text','Make separate','Tag','MakeSeparate','FontSize',15, ...
    'ButtonPushedFcn',@separate);
go=uibutton(g,'Text','Continue','Tag','ContinueAverage','FontSize',15, ...
    'ButtonPushedFcn',@combine);
drawnow; focus(go); uiwait(f);
clear cleanup;
    function combine(varargin), average=true; uiresume(f); end
    function separate(varargin), average=false; uiresume(f); end
    function cancel(varargin), average=[]; uiresume(f); end
    function key(~,event)
        if strcmp(event.Key,'return'), combine();
        elseif strcmp(event.Key,'escape'), cancel(); end
    end
end

function export_grouped_trials(EEG,eventIDs,labels,included,electrodes,conditions,recordingID,folder,averageElectrodes)
% Group trial columns by condition and write the data CSV(s).
% Each signal is one electrode or an equal-weight electrode average.
assert(isscalar(averageElectrodes) && islogical(averageElectrodes));
assert(~isempty(electrodes) && numel(unique(electrodes))==numel(electrodes),'Select unique electrodes.');
[found,channelIndices]=ismember(electrodes,{EEG.chanlocs.labels});
assert(all(found),'Electrode not found.');
signalNames=electrodes;
if averageElectrodes, signalNames={['AVG_' strjoin(electrodes,'_')]}; end
assert(EEG.trials==numel(eventIDs) && EEG.trials==numel(labels) && EEG.trials==numel(included));
assert(numel(unique(eventIDs))==EEG.trials,'Event identifiers must be unique.');
assert(all(isfinite(EEG.data(:))),'Nonfinite EEG voltage.');
labels=string(labels(:)); included=logical(included(:)); eventIDs=eventIDs(:);
assert(~isempty(regexp(recordingID,'^[A-Za-z0-9_]+$','once')),'Unsafe recording ID.');
assert(numel(unique(conditions))==numel(conditions),'Select unique conditions.');
time=(0:EEG.pnts-1)'/EEG.srate;
for c=1:numel(signalNames)
 if averageElectrodes, ci=channelIndices; else, ci=channelIndices(c); end
 keep=[]; columnNames={};
 for d=1:numel(conditions)
  ix=find(labels==string(conditions{d}) & included);
  assert(numel(ix)>=2,'Each selected condition needs at least two retained trials.');
  keep=[keep;ix];
  columnNames=[columnNames,cellstr(compose('%s__%s__trial_event%06d',signalNames{c},conditions{d},eventIDs(ix)))'];
 end
 % Average electrodes at each sample; keep individual trials.
 if averageElectrodes
  values=reshape(mean(double(EEG.data(ci,:,keep)),1),EEG.pnts,numel(keep));
 else
  values=double(reshape(EEG.data(ci,:,keep),EEG.pnts,numel(keep)));
 end
 if numel(signalNames)==1
  filename=fullfile(folder,['DDA_' recordingID '.csv']);
 else
  filename=fullfile(folder,['DDA_' recordingID '_' signalNames{c} '.csv']);
 end
 assert(~isfile(filename),'Data CSV already exists; choose a new output folder.');
 fid=fopen(filename,'w'); assert(fid>=0,'Cannot create output CSV.');
 cleanup=onCleanup(@() fclose(fid));
 fprintf(fid,'%s\n',strjoin([{'time'} columnNames],','));
 fmt=[repmat('%.17g,',1,numel(keep)) '%.17g\n'];
 fprintf(fid,fmt,[time values]');
 clear cleanup;
 restored=readmatrix(filename,'NumHeaderLines',1);
 assert(isequal(size(restored),[EEG.pnts,numel(keep)+1]));
 assert(isequal(restored(:,2:end),values),'Voltage values changed on CSV roundtrip.');
 assert(max(abs(restored(:,1)-time))<1e-15,'Time values changed on CSV roundtrip.');
 fprintf('VERIFIED combined CSV: %s; %d samples, %d trials\n',filename,EEG.pnts,numel(keep));
end
end
