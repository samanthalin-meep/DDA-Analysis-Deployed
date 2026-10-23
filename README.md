# DDA Analysis

A browser workspace for the existing DDALab pooled cross-trial workflow, running entirely on Vercel at **https://dda-analysis-deployed.vercel.app**.

The browser runs the original DDALAB Pooled 1.2.10 Qt program. Its panels, settings, trial selection, plots, and exports use the supplied desktop source. Browser controls follow the native controls for keyboard and accessibility access. Select **Upload recording**, then select the EDF, TXT log, and conditions CSV. MATLAB prepares the data in the background. The prepared files open in DDALab. Use its existing controls to run an analysis. **Open File** also accepts prepared CSVs and the other desktop formats.

## Application

The deployable Next.js application is in **`web/`**. Set the Vercel project's **Root Directory to `web`**.

Commits pushed to `main` trigger a Vercel production build. A successful build updates **https://dda-analysis-deployed.vercel.app**. Automatic Git deployments are enabled in the Vercel project and in `web/vercel.json`.

- Next.js provides the upload dialog and authenticated session APIs.
- The original Qt interface runs in an isolated Vercel Sandbox and reaches the browser through authenticated noVNC. The desktop layout is preserved. Browser file dialogs and downloads replace operating-system dialogs.
- Private Vercel Blob stores uploads, job records, outputs, and saved desktop state.
- Vercel Workflows coordinates durable jobs.
- Vercel Sandbox runs the original Qt program, compiled MATLAB preparation, and preserved Rust analysis engine. There is no separately hosted worker.
- MATLAB Runtime is installed once on a Vercel Drive. Analyses mount a read-only copy of that shared dependency cache and start from a small operating-system snapshot.

Connect a **private** Vercel Blob store to the project for Production, Preview, and Development. Vercel provides `BLOB_READ_WRITE_TOKEN` and/or Blob OIDC configuration. Sandbox uses the project's Vercel OIDC credentials. No MATLAB account, license file, or activation key is needed on Vercel.

The project registry must contain `dda-ubuntu:24.04`, copied from the official Ubuntu Linux/amd64 image pinned at `sha256:a2d43bffc46670d7108bb3c0468c67c5557c4c92e83e1e34cbff1322ad1b94dc`. MATLAB R2025a uses Ubuntu24.04 dependencies. The workflow installs the runtime once before any recording is loaded. The shared Drive contains runtime dependencies only; each job has its own writable workspace. Concurrent first recordings wait for the initial installation. Bump the environment revision in `web/lib/runtime.ts` when changing the compiled package or installed dependencies; runner source is refreshed for each job.

For local development, install Node.js22+ and pnpm11.25, then run:

```sh
cd web
pnpm install
pnpm dev
```

The interface requires the connected private Blob store and Vercel Sandbox access. Link the project and run `vercel env pull .env.local` before local development. The normal browser session cookie owns the saved data; clearing it starts a separate session.

The desktop environment is cached as a clean dependency snapshot at the private Blob key `system/desktop/environment-v1.json`. It contains no recording or browser credential. New desktop sessions refresh the source archive. The adapter saves the SQLite database, input files, and exports to the owning session. Desktop sandboxes run for up to 39 minutes and stop after ten idle minutes. Active users reconnect from saved state; hidden browser tabs do not start replacement sandboxes. A short reconnect is expected. The browser polls storage only while a desktop session starts or a recording is processing. Saved-state files are rewritten only when the program state changes. Save exports before clearing browser storage.

Session and job metadata use Vercel Runtime Cache with a one-hour TTL and immediate updates after durable writes. Cache keys use SHA-256 and include the project, environment, store, and owning session. Blob remains the durable source if an entry is evicted. Job lists are cached for five minutes. Repeated reads of a blocked store are limited to one attempt per minute for each key. The viewer polls its isolated program directly, without Blob reads. Desktop startup checks run every ten seconds; preparation checks run every fifteen seconds and stop at completion or after three failures. Hidden tabs stop checking. Unchanged preparation status does not trigger another Blob write. Immutable input and output downloads use Blob's cache; session restore always uses the latest checkpoint.

Desktop source provenance, browser changes, and the text standard are documented in `web/desktop/SOURCE.md`. Interface text follows ASD-STE100 principles; full standard certification is not claimed.

## Scientific processing

`DDA_prep.m` is retained unchanged. A deployment build adapter under `web/runner/matlab/` changes only resource/path initialization and wraps the recipe as a portable compiled Python package. Compile locally with MATLAB Compiler SDK; the generated archive runs using the freely available MATLAB Runtime.

The existing recipe expects continuous1000Hz HydroCel EDF recordings with E1–E129 plus Status. It validates event labels/times against the acquisition log and physical Status pulses, references E57/E100, filters57–63Hz and0.1–30Hz, detects/interpolates channels, resamples to250Hz, epochs−200 to+800ms, applies the−200 to0ms baseline, and flags artifacts at±4.5global SD. Selected electrodes may be averaged within each trial; individual trials remain separate. Pooled CT fits each condition separately, requiring at least two retained trials per selected condition.

The native Rust engine source and its MIT license are preserved in `web/runner/dda-rs/`. GitHub Actions builds/tests its Linux executable. Compiled preparation and native-engine artifacts are attached to GitHub Releases; the runtime setup verifies the preparation archive hash.

### Verification

The complete sample EDF/TXT/CSV was uploaded to production and processed on Linux in Vercel Sandbox. Its prepared data and counts CSVs were byte-identical to an untouched local run of the original MATLAB script: 250 samples × 283 retained trials, zero numeric difference. All six conditions and 19 pooled CT windows matched an independent NumPy least-squares calculation, with maximum absolute a₁ difference 1.74 × 10⁻¹⁵. The original desktop loader and CT backend also reproduced all six condition rows exactly. Native CSV export, saved-result reload, and a window-step change passed. The actual Qt analysis interface rendered Graph and Heatmap views on Linux. All six original output files downloaded successfully; a request without the owning browser session was denied. See `web/tests/deployment-verification.json` for the recorded checks.

Executable checks:

```sh
cd web
pnpm test
pnpm typecheck
pnpm build
python tests/test_desktop_state.py
DDALAB_CLI_PATH=/path/to/ddalab python tests/verify_desktop_backend.py /path/to/prepared.csv /path/to/reference-result.json
python tests/verify_native_parity.py /path/to/prepared.csv /path/to/ddalab
python tests/verify_deployed_result.py /path/to/prepared.csv /path/to/result.json
```

Each browser receives a separate signed session; recording history and desktop state belong to that browser session. Output downloads are authorized through the same session and use short-lived private storage URLs.

## Original desktop snapshot

The original folder remains at the repository root:

- `DDALab Pooled.app/`: existing Apple Silicon macOS app and dependencies.
- `DDA_prep.m`: original MATLAB preparation.
- `Sample_I1_R3_data/`: sample EDF, acquisition TXT log, conditions CSV.
- `programs/`: EEGLAB/ERPLAB with their existing license/attribution files.
- `read.txt`: original desktop instructions.
- `snapshot-manifest.json`: original copied file hashes and symlink targets.

EDF files use Git LFS. Install Git LFS before cloning to obtain the actual recordings. macOS metadata and nested `.git` metadata were omitted from the snapshot. The desktop `.app` is preserved as a reference and is not used as the Vercel executable.
