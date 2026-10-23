# Source provenance

The original MATLAB recipe, scientific dependencies, desktop app snapshot, and engine sources are retained at the repository root and in `web/`. The GitHub Pages artifact contains only the browser app, required scientific runtime, coordinates, and notices.

## Numerical sources

`python/preparation.py` translates these checked-in sources:

- `DDA_prep.m`: log/label and Status alignment, reference/filter/interpolation/resample sequence, epoch/baseline/artifacts, electrode averaging, condition grouping, and CSV export.
- `programs/eeglab2026.0.0/functions/sigprocfunc/reref.m`: E57/E100 reference matrix, with single-precision matrix multiplication.
- `programs/eeglab2026.0.0/plugins/firfilt/{pop_eegfiltnew,firws,firfilt}.m`: 1651-tap notch, 33001-tap passband, symmetric windows, DC endpoint padding, centered single-pass filtering. FFT convolution accelerates the same FIR operation.
- `programs/eeglab2026.0.0/functions/{popfunc/pop_rejchan,sigprocfunc/jointprob}.m`: 1000-bin probability measure and the original inclusive trimmed normalization indices.
- `programs/eeglab2026.0.0/functions/popfunc/eeg_interp.m`: spherical interpolation, lambda 0, exponent 4, degree 7; original chord-distance Legendre argument.
- `programs/eeglab2026.0.0/functions/popfunc/pop_resample.m`: 131-tap Kaiser anti-aliasing kernel, 68-sample padding, 1000→250 Hz polyphase resampling, one-based event latencies.
- `programs/erplab12.20/pop_functions/pop_epochbin.m` and EEGLAB epoch/baseline functions: 250-sample epochs and a 51-sample inclusive baseline.
- `programs/erplab12.20/pop_functions/pop_artextval.m`: inclusive ±4.5 threshold on globally normalized single-precision samples, all channels.
- HydroCel coordinates from `GSN-HydroCel-129.sfp`; `Cz` is renamed E129.

`python/workspace.py` follows the original desktop loader's trial-column grouping and the FastICA settings in `web/desktop/vendor/ddalab_qt/backend/api.py`. Scientific library versions are pinned in `runtime-manifest.json` and the Pyodide lock file.

`scripts/engine.mjs` copies the original MIT-licensed Rust numerical sources from `web/runner/dda-rs`. It substitutes a browser monotonic clock and initializes the progress timer without subtracting one second, which could underflow in a newly created worker. Numerical algorithms are unchanged. Rayon uses its documented single-thread fallback. The wrapper only accepts a request, labels, and an f64 matrix, and returns the original result.

## Interface

Layout, colors, control names, DDA defaults, plot axes, condition grouping, and file/session flow follow DDALAB Pooled 1.2.10 and `web/desktop/vendor/ddalab_qt`. The web implementation is new React/HTML/CSS code, with browser file pickers, local downloads, and IndexedDB replacing desktop filesystem/database access. The supplied TTF files contain saved HTML, so the web font stack uses the same Helvetica Neue fallback observed in the native application.

Technical names retained in concise instructions include EDF, TXT, CSV, EEG, HydroCel, E1–E129, Status, DDA, CT, ST, CD, DE, SY, ICA, MODEL, tau, epoch, baseline, artifact, probability, interpolation, and global SD. These are scientific labels, not claims of ASD-STE100 dictionary certification.

## Notices

Upstream licenses and individual source-file copyright notices remain authoritative. Copies are supplied in `public/licenses/`. The original Qt source's supplied license status is preserved; no new license is assigned to that source. Scientific wheels contain their own upstream notices. No MATLAB Runtime, activation material, university license, Vercel credential, recording, or user session is included in the deployed artifact.
