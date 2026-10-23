function build_runtime_package(repositoryRoot, buildRoot)
% Build on a licensed development machine. Deployment gets runtime code only.
% MATLAB Compiler + Compiler SDK are required locally, not on Vercel.
arguments
    repositoryRoot (1,:) char
    buildRoot (1,:) char
end
assert(license('test', 'Compiler') && license('test', 'MATLAB_Builder_for_Java'), ...
    'Local MATLAB Compiler and Compiler SDK entitlements are required.');
assert(~isempty(which('mcc')), 'Install MATLAB Compiler and Compiler SDK first.');
assert(~isfolder(buildRoot), 'Choose an empty build directory.');
mkdir(buildRoot);
stage = fullfile(buildRoot, 'source'); mkdir(stage);
copyfile(fullfile(repositoryRoot, 'programs'), fullfile(stage, 'programs'));
% Package the dependencies used by this recipe, excluding optional toolboxes,
% examples, and Octave-only compatibility functions that MATLAB cannot parse.
eegRoot = fullfile(stage, 'programs', 'eeglab2026.0.0');
plugins = dir(fullfile(eegRoot, 'plugins'));
for k = 1:numel(plugins)
    if plugins(k).isdir && ~startsWith(plugins(k).name, '.') && ...
            ~ismember(plugins(k).name, {'Biosig3.8.5', 'firfilt'})
        rmdir(fullfile(plugins(k).folder, plugins(k).name), 's');
    end
end
biosigRoot = fullfile(eegRoot, 'plugins', 'Biosig3.8.5', 'biosig');
biosigDirectories = dir(biosigRoot);
for k = 1:numel(biosigDirectories)
    if biosigDirectories(k).isdir && ~startsWith(biosigDirectories(k).name, '.') && ...
            ~ismember(biosigDirectories(k).name, ...
            {'t200_FileAccess', 't250_ArtifactPreProcessingQualityControl', 'doc'})
        rmdir(fullfile(biosigDirectories(k).folder, biosigDirectories(k).name), 's');
    end
end
unused = {fullfile(eegRoot, 'sample_data'), fullfile(eegRoot, 'tutorial_scripts'), ...
    fullfile(eegRoot, 'plugins', 'Biosig3.8.5', 'NaN'), ...
    fullfile(eegRoot, 'plugins', 'Biosig3.8.5', 'tsa'), ...
    fullfile(eegRoot, 'plugins', 'Biosig3.8.5', 'biosig', 'maybe-missing'), ...
    fullfile(eegRoot, 'plugins', 'Biosig3.8.5', 'biosig', 'demo'), ...
    fullfile(stage, 'programs', 'erplab12.20', 'studio_functions'), ...
    fullfile(stage, 'programs', 'erplab12.20', 'deprecated_functions')};
for k = 1:numel(unused)
    if isfolder(unused{k}), rmdir(unused{k}, 's'); end
end
eeglabFile = fullfile(eegRoot, 'eeglab.m');
eeglabSource = fileread(eeglabFile);
eeglabSource = replace(eeglabSource, 'if option_checkversion && ismatlab', ...
    'if false && option_checkversion && ismatlab');
writeText(eeglabFile, eeglabSource);
% This recipe reads EDF through BIOSIG MATLAB code. Remove foreign binaries so
% the archive cannot accidentally select a macOS/Windows native dependency.
foreign = [dir(fullfile(stage, '**', '*.mexw*')); ...
           dir(fullfile(stage, '**', '*.mexm*')); ...
           dir(fullfile(stage, '**', '*.mexa64')); ...
           dir(fullfile(stage, '**', '*.dylib')); ...
           dir(fullfile(stage, '**', '*.dll'))];
for k = 1:numel(foreign)
    delete(fullfile(foreign(k).folder, foreign(k).name));
end
source = fileread(fullfile(repositoryRoot, 'DDA_prep.m'));
source = replace(source, 'function outputRoot = DDA_prep(cfg)', ...
    'function outputRoot = DDA_prep_compiled(cfg)');
source = replace(source, 'cfg.projectRoot=find_preparation_root(cfg.projectRoot);', ...
    'if ~isdeployed, cfg.projectRoot=find_preparation_root(cfg.projectRoot); end');
pathSetup = sprintf(['oldPath=path; cleanupPath=onCleanup(@() path(oldPath));\n' ...
    'restoredefaultpath;\n' ...
    'addpath(fullfile(cfg.projectRoot,''eeglab2026.0.0'')); eeglab nogui;\n' ...
    'addpath(genpath(fullfile(cfg.projectRoot,''erplab12.20'')));']);
assert(contains(source, pathSetup), 'Preparation path setup changed; review adaptation.');
source = replace(source, pathSetup, sprintf(['if ~isdeployed\n%s\n' ...
    'else\n    eeglab nogui;\nend'], pathSetup));
writeText(fullfile(stage, 'DDA_prep_compiled.m'), source);
copyfile(fullfile(repositoryRoot, 'web', 'runner', 'matlab', 'dda_prep_runtime.m'), stage);
oldPath = path; cleanPath = onCleanup(@() path(oldPath));
oldFolder = pwd; cleanFolder = onCleanup(@() cd(oldFolder));
restoredefaultpath;
addpath(fullfile(stage, 'programs', 'eeglab2026.0.0'));
eeglab nogui;
addpath(genpath(fullfile(stage, 'programs', 'erplab12.20')));
cd(stage);
packageRoot = fullfile(buildRoot, 'python-package'); mkdir(packageRoot);
% Let the dependency analyzer collect called MATLAB functions. Adding every
% source file would compile unrelated plotting tools and Octave examples.
resources = {fullfile('programs', 'eeglab2026.0.0', 'functions', 'supportfiles', ...
    'channel_location_files', 'philips_neuro', 'GSN-HydroCel-129.sfp'), ...
    fullfile('programs', 'eeglab2026.0.0', 'functions', 'adminfunc', 'eeg_options.m'), ...
    fullfile('programs', 'eeglab2026.0.0', 'functions', 'adminfunc', 'eeg_options.txt'), ...
    fullfile('programs', 'eeglab2026.0.0', 'functions', 'adminfunc', 'eeg_optionsbackup.txt'), ...
    fullfile('programs', 'eeglab2026.0.0', 'functions', 'adminfunc', 'eeglab_options.m'), ...
    fullfile('programs', 'eeglab2026.0.0', 'plugins', 'Biosig3.8.5', 'biosig', 'doc'), ...
    fullfile('programs', 'erplab12.20', 'erplab_default_values.m')};
resourceOptions = {};
for k = 1:numel(resources)
    assert(isfile(resources{k}) || isfolder(resources{k}), ...
        'Missing explicit runtime resource: %s', resources{k});
    resourceOptions = [resourceOptions, {'-a', resources{k}}];
end
mcc('-W', 'python:dda_preparation', '-A', 'glnxa64', '-A', 'maca64', ...
    '-d', packageRoot, '-v', 'dda_prep_runtime.m', resourceOptions{:});
writeText(fullfile(buildRoot, 'runtime-version.json'), jsonencode(struct( ...
    'release', version('-release'), 'version', version, ...
    'buildArchitecture', computer('arch'), 'deploymentArchitecture', 'glnxa64', ...
    'package', 'dda_preparation', 'entryPoint', 'dda_prep_runtime')));
fprintf('DDA_RUNTIME_PACKAGE=%s\n', packageRoot);
end

function writeText(destination, text)
fid = fopen(destination, 'w');
assert(fid >= 0, 'Cannot write build file.');
cleanup = onCleanup(@() fclose(fid));
fwrite(fid, text, 'char');
end
