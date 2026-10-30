# DDALAB Pooled — GitHub Pages

Static browser edition: https://samanthalin-meep.github.io/DDA-Analysis-Deployed/

The deploy workflow runs on every push to `main`. A successful build publishes the site through GitHub Pages. Build failures retain the last successful deployment. The `Deploy GitHub Pages` workflow also supports manual runs. No secrets are required.

## Workflow

1. Select **Upload recording**.
2. Select the EDF, acquisition TXT, and conditions CSV from one recording.
3. Enter a recording ID. All electrodes and analysis conditions are selected when their files load. Use the checkboxes or **Select all** and **Clear** at the bottom of each box to change the selection. **Keep electrodes together for DDA** is selected by default and retains every selected electrode's individual accepted trials.
4. Select **Run preparation**. The same page focuses **DDA Configuration** with the prepared data loaded.
5. Select trials and DDA settings. New preparations use **DDA first, then average electrodes**: fit each electrode separately using all selected trials in each condition, then take an equal-weight mean of its DDA coefficients across electrodes. **Average EEG first (original method)** remains available for comparison. Select **Run DDA**. The same page focuses **Results**. Configuration and results remain on the same page.
6. Download CSV, PNG, SVG, JSON, or a `.ddalab` session.

Prepared CSV files can also be opened directly. A session contains its prepared data, settings, annotations, and selected result. Browser storage can retain prepared files and results across reloads. Raw EDF/TXT/conditions files are removed from worker memory after preparation. No recording is sent over the network.

In Visualize, select one or more electrodes. One selection shows that electrode; multiple selections show their mean within each trial. Select a condition, then choose **Trial average**, **Separate trials**, or **One trial**. The trial list has **Select all** and **Clear** controls. The average uses every selected trial in that condition. Separate trials appear in stacked rows, eight per page, with one voltage scale across pages. Previous/Next controls reach every selected trial. The graph export contains the displayed rows.

New preparations retain the cleaned, accepted individual signals used to make the electrode average. Browser storage and full `.ddalab` sessions preserve these signals. Prepared CSV files contain the original analysis matrix only; older average-only files require the three source files to be prepared once again to enable electrode selection. Visualization selection and trial averaging do not change the DDA matrix, settings, or selected analysis trials.

The new averaging mode uses the retained individual signals, not the prepared CSV's EEG average. It saves the per-electrode DDA results as well as their mean. An average-only CSV cannot be used for this mode; prepare its source recording again or open a full session containing the individual signals. Old saved sessions retain their original averaging method. The CSV result export records averaging stage and electrode count. This is an across-electrode mean within one recording, not a participant grand average.

The practice defaults remain exploratory: 250 Hz prepared data, 50 fitted samples (200 ms), 10-sample steps (40 ms), delays of 7 and 10 samples (28/40 ms), and model terms `[1,2,10]`. Delay and derivative context expands each input block to 68 samples. The first fitted center is −46 ms but its target interval spans −144 to +52 ms; it is not a purely pre-event estimate. Prepared clips place the event at 0.2 s from file start. A manually entered event onset is honored and recorded. Study-specific window, model, artifact, electrode and aggregation choices require protocol confirmation.

Downloads start with the Recording ID, such as `I1_R4_prepared.csv`, `I1_R4_results_CT.csv`, and `I1_R4_graph.png`. All PNG and SVG graphs use `[Recording ID]_graph` without additional suffixes. Older imported files use their source filename when no Recording ID was saved. Dataset column names and analysis identifiers retain their full original values.

## Conditions CSV

Both input formats are accepted. Column names are case-insensitive.

| Columns | Time values |
| --- | --- |
| `sec_time`, `label` | Absolute acquisition message times, in seconds. Each time must match the TXT log. |
| `Duration`, `Intertrial Interval`, `Condition` | Stimulus duration and the gap after it, in seconds. Extra columns such as `stimIte1` are allowed. |

Keep the duration table in presentation order, including the `start` and `reject` rows. Select the EDF and TXT from the same recording. The app checks stimulus-to-stimulus intervals (`Duration + Intertrial Interval`) against the recorded intervals within 100 ms. The planned startup wait can differ from the recorded start-to-first-stimulus interval. The app uses the log's actual event times and physical EDF marker positions for EEG alignment; it does not accumulate durations to estimate EEG onsets. Every logged Status pulse, including the initial marker, must match under one exact sample-index convention: one-based sample latencies or zero-based export times. Missing markers and inconsistent shifts remain errors. Nontrial markers such as `net` are checked but do not become trials.

## Implementation

- React interface with the original desktop colors, layout, tab structure, defaults, and graph semantics.
- Preserved `dda-rs` 0.2.0 engine, compiled to WebAssembly. Numerical source is copied from `vendor/dda-rs` at the repository root during the build; only progress-clock plumbing changes.
- NumPy/SciPy preparation port in `python/preparation.py`, derived from the original `DDA_prep.m` and its exact EEGLAB/ERPLAB callees.
- A dedicated browser Web Worker runs calculations without blocking interface input. This is part of the website and runs on the visitor's device.
- Pinned, self-hosted Pyodide 0.27.7 runtime and scientific packages. Downloads are checked against SHA-256 hashes at build time.
- CSV import, pooled CT by condition, trial selection, continuous-channel ST/SY/DE/CT/CD and conditional variants, ICA, batch analysis, saved-result comparison, waveform display, annotations, heatmaps, local sessions, and exports.
- Versioned application, worker, Python, and engine asset paths prevent stale code after updates.

The browser edition supports the recording format checked by the original preparation recipe: continuous 1000 Hz HydroCel EDF with E1–E129 and Status, a matching acquisition log, and condition labels. Timestamp tables retain the original exact message-time check. Duration tables use the schedule check described above. Both use the recorded event times and exact physical-pulse alignment. Pooled condition files require CT and at least two retained trials per selected condition, as in the desktop program.

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
node tests/verify-condition-timing.mjs
node tests/verify-signal-labels.mjs
node tests/verify-waveforms.mjs
node tests/verify-event-timing.mjs
node tests/verify-analysis-worker.mjs
node tests/verify-electrode-averaging.mjs
pnpm dev
```

`pnpm dev` serves the built static app at `http://localhost:3013/`. Rebuild and reload after changes. Deploy only `pages/dist`.

To repeat the complete preparation comparison, obtain the sample EDF through Git LFS, then run:

```sh
node tests/verify-preparation.mjs /tmp/ddalab-preparation-proof
```

This checks the default electrode-average preparation, individual-signal retention and restore, known trial counts, rejected-channel list, and full reconstructed E1 CSV hash. It writes prepared files only to the selected local output directory. `verify-waveforms.mjs` checks single and multiple electrode views, trial means, complete separate-trial output, condition isolation, unchanged DDA inputs and CSV exports, and corrupt-storage rejection in the same WebAssembly Python runtime.

Source provenance and license notices are in `SOURCE.md` and `public/licenses/`. UI instructions use short command sentences and the original scientific terms. ASD-STE100 certification is not claimed.
