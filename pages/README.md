# DDALAB Pooled — GitHub Pages

Static browser edition: https://samanthalin-meep.github.io/DDA-Analysis-Deployed/

The deploy workflow runs on every push to `main`. A successful build publishes the site through GitHub Pages. Build failures retain the last successful deployment. The `Deploy GitHub Pages` workflow also supports manual runs. No secrets are required.

## Workflow

1. Select **Upload recording**.
2. Select the EDF, acquisition TXT, and conditions CSV from one recording.
3. Enter a recording ID. Select electrodes and conditions from the uploaded files. The ID and selections start empty. Multiple electrodes can be averaged within each trial or exported separately.
4. Select **Run preparation**. The same page opens **Trials and settings** with the prepared data loaded.
5. Select trials and DDA settings. Select **Run DDA**. The same page moves to **Results**. Use the step controls to return to settings.
6. Download CSV, PNG, SVG, JSON, or a `.ddalab` session.

Prepared CSV files can also be opened directly. A session contains its prepared data, settings, annotations, and selected result. Browser storage can retain prepared files and results across reloads. Raw EDF/TXT/conditions files are removed from worker memory after preparation. No recording is sent over the network.

## Implementation

- React interface with the original desktop colors, layout, tab structure, defaults, and graph semantics.
- Preserved `dda-rs` 0.2.0 engine, compiled to WebAssembly. Numerical source is copied from `vendor/dda-rs` at the repository root during the build; only progress-clock plumbing changes.
- NumPy/SciPy preparation port in `python/preparation.py`, derived from the original `DDA_prep.m` and its exact EEGLAB/ERPLAB callees.
- A dedicated browser Web Worker runs calculations without blocking interface input. This is part of the website and runs on the visitor's device.
- Pinned, self-hosted Pyodide 0.27.7 runtime and scientific packages. Downloads are checked against SHA-256 hashes at build time.
- CSV import, pooled CT by condition, trial selection, continuous-channel ST/SY/DE/CT/CD and conditional variants, ICA, batch analysis, saved-result comparison, waveform display, annotations, heatmaps, local sessions, and exports.
- Versioned application, worker, Python, and engine asset paths prevent stale code after updates.

The browser edition supports the recording format checked by the original preparation recipe: continuous 1000 Hz HydroCel EDF with E1–E129 and Status, a matching acquisition log, and condition labels. The same event-time and physical-pulse alignment checks run before preparation. Pooled condition files require CT and at least two retained trials per selected condition, as in the desktop program.

This is a browser rebuild of the core workflow. Native operating-system dialogs, the Qt process itself, other desktop recording formats, streaming, remote compute integrations, and desktop-specific export/script options are not included. Connectivity currently displays the real variant rows as a heatmap; it does not recreate the native network-motif animation. Imported desktop `.ddalab` files can display their saved results; reopening their original disk paths requires selecting the source CSV. Browser sessions include prepared CSV data for transfer.

Use a desktop browser with enough memory for raw recording preparation. The first operation loads approximately 41 MB of cached scientific tools. Large recordings use local CPU and RAM.

## Validation

The original sample EDF/TXT/CSV was processed in the actual WebAssembly Python runtime:

- 380 epochs; 283 retained trials; condition counts 145, 28, 27, 30, 24, 29.
- The same 11 rejected channels and retained selected-condition event IDs as the MATLAB reference.
- The full E1 CSV is byte-identical to the untouched MATLAB output, SHA-256 `007778d72ae03021c097a6eef1556d9651d2bb3b416fdb189c074a8652076cc3`.
- 1,415 checked output samples for the default E129 electrode match MATLAB exactly.
- Interpolated E17 samples differ slightly: maximum 0.0126648 µV and RMS 0.00109965 µV across the same 1,415 checked samples. Single-precision interpolation and FFT convolution can differ in last-bit rounding across numeric libraries. Byte identity is not claimed for every electrode or recording.
- An actual browser run of the trusted prepared file produced 114 pooled CT coefficients across six conditions and 19 windows, identical to the preserved native engine result. The analysis CSV downloaded successfully.
- All ten engine variants return finite results in WebAssembly. An independent NumPy pooled CT fixture agrees within 1.73 × 10⁻¹⁵.

See `tests/validation.json`. Browser access to the local preview was subsequently declined, so later file chooser, session round-trip, and PNG download checks were not completed in the browser. The build/type checks and independent numerical checks remain available below.

## Build

Install Node.js 22+, pnpm 11.25, Rust 1.99.1 with `wasm32-unknown-unknown`, and `wasm-bindgen-cli` 0.2.104.

```sh
cd pages
pnpm install --frozen-lockfile --ignore-scripts
pnpm wasm
pnpm run runtime
pnpm check
pnpm build
node tests/verify-engine.mjs
node tests/verify-recording-input.mjs
pnpm dev
```

`pnpm dev` serves the built static app at `http://localhost:3013/`. Rebuild and reload after changes. Deploy only `pages/dist`.

To repeat the complete preparation comparison, obtain the sample EDF through Git LFS, then run:

```sh
node tests/verify-preparation.mjs /tmp/ddalab-preparation-proof
```

This checks the known trial counts, rejected-channel list, and full prepared E1 CSV hash. It writes prepared files only to the selected local output directory.

Source provenance and license notices are in `SOURCE.md` and `public/licenses/`. UI instructions use short command sentences and the original scientific terms. ASD-STE100 certification is not claimed.
