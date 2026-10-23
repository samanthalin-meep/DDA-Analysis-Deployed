# MATLAB preparation runtime

`build_runtime_package.m` packages the existing `DDA_prep.m` EEG recipe as a
Python-callable MATLAB Runtime component. Build it on a development machine with
MATLAB, MATLAB Compiler, MATLAB Compiler SDK, and the toolboxes used by the
recipe. The deployed component uses the freely available MATLAB Runtime; no
MATLAB license, account token, or activation file belongs on Vercel.

The build generates a separate copy of the preparation function. Its numerical
operations are preserved. The changes rename the internal function, retain the
compiled dependency path, find the bundled channel-location resource, and
provide a JSON boundary. The original root `DDA_prep.m` is unchanged.

## Build

From a licensed MATLAB R2025a session:

```matlab
addpath(fullfile(repositoryRoot, 'web', 'runner', 'matlab'));
build_runtime_package(repositoryRoot, emptyBuildDirectory);
```

The output is `python-package/`, containing `setup.py`, `pyproject.toml`, and the
`dda_preparation` package. The package targets Linux x86-64 and Apple silicon.
Foreign native plugins are excluded; this recipe uses BIOSIG's MATLAB EDF reader.
The compiler collects called functions and explicitly includes the HydroCel
channel-location and options files. Unused MATLAB/Octave examples are excluded.

## Runtime

Use Python 3.12 and MATLAB Runtime R2025a Update 1 or newer. Install the generated
Python package with `python3.12 -m pip install .`. The Runtime
provides its Python bridge; installing the licensed MATLAB Engine is unnecessary.

Set `LD_LIBRARY_PATH` before launching Python, using the actual Runtime root:

```sh
export LD_LIBRARY_PATH="$MCRROOT/runtime/glnxa64:$MCRROOT/bin/glnxa64:$MCRROOT/sys/os/glnxa64:$MCRROOT/extern/bin/glnxa64"
export MCR_CACHE_ROOT=/vercel/sandbox/dda/work/runtime-cache
```

Call the component:

```python
import json
import dda_preparation

dda_preparation.initialize_runtime(['-nodisplay'])
runtime = dda_preparation.initialize()
try:
    output_directory = runtime.dda_prep_runtime(json.dumps(config), nargout=1)
finally:
    runtime.terminate()
```

The JSON configuration has the same fields as `DDA_prep(cfg)`. The wrapper supplies
the packaged `projectRoot`; provide absolute input/output paths, `recordingID`,
`electrodes`, `conditions`, and `averageElectrodes`. The output directory must not
already exist. Console output retains the existing timestamped processing stages.
The SDK accepts `io.StringIO` objects for optional console redirection.

## Official references

- [Compiler platform portability](https://www.mathworks.com/help/compiler/ensuring-multi-platform-portability.html)
- [R2025a compiler targets and platform option](https://www.mathworks.com/help/releases/R2025a/compiler/mcc.html)
- [Installing generated Python packages](https://www.mathworks.com/help/compiler_sdk/python/import-compiled-python-packages.html)
- [MATLAB Runtime installation](https://www.mathworks.com/help/compiler_sdk/ml_code/install-the-matlab-runtime.html)
- [Runtime library paths](https://www.mathworks.com/help/compiler_sdk/ml_code/mcr-path-settings-for-run-time-deployment.html)
- [Official Ubuntu 24.04 dependency list](https://github.com/mathworks-ref-arch/container-images/blob/main/matlab-deps/r2025a/ubuntu24.04/base-dependencies-amd64.txt)

EEGLAB, ERPLAB, BIOSIG, and firfilt source and copyright/license notices remain in
the repository's `programs/` tree. Runtime redistribution is governed by the
MathWorks MATLAB Runtime terms.
