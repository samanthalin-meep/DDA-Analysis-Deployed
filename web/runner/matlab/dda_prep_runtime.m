function outputRoot = dda_prep_runtime(configJSON)
% JSON boundary for the existing EEG preparation recipe in MATLAB Runtime.
% No account, activation token, or MATLAB license is needed at runtime.
cfg = jsondecode(char(configJSON));
cfg.electrodes = cellstr(string(cfg.electrodes));
cfg.conditions = cellstr(string(cfg.conditions));
if ~isfield(cfg, 'averageElectrodes'), cfg.averageElectrodes = false; end
cfg.averageElectrodes = logical(cfg.averageElectrodes);
set(groot, 'DefaultFigureVisible', 'off');
if isdeployed
    cfg.projectRoot = fullfile(fileparts(mfilename('fullpath')), 'programs');
    if ~isfile(fullfile(cfg.projectRoot, 'eeglab2026.0.0', 'functions', ...
            'supportfiles', 'channel_location_files', 'philips_neuro', 'GSN-HydroCel-129.sfp'))
        error('DDA:MissingResources', 'Compiled channel-location resources are missing.');
    end
end
outputRoot = DDA_prep_compiled(cfg);
end
