# DDA Analysis

A browser workspace for the existing DDALab pooled cross-trial workflow, designed to run entirely on Vercel.

Upload one EDF recording, its TXT acquisition log, and a conditions CSV. Select electrodes and conditions, then preparation and pooled DDA run in the background. Results open automatically with interactive condition plots, trial counts, and downloads. Prepared trial CSVs can also be analyzed directly.

## Application

The deployable Next.js application is in **`web/`**. Set the Vercel project's **Root Directory to `web`**.

- Next.js provides the interface and authenticated session APIs.
- Private Vercel Blob stores uploads, job records, and outputs.
- Vercel Workflows coordinates durable jobs.
- Vercel Sandbox runs the compiled MATLAB preparation and preserved Rust pooled-analysis engine.
- The first recording installs MATLAB Runtime and saves a clean environment snapshot; later recordings reuse it.

Connect a **private** Vercel Blob store to the project for Production, Preview, and Development. Vercel provides `BLOB_READ_WRITE_TOKEN` and/or Blob OIDC configuration. Sandbox uses the project's Vercel OIDC credentials. No MATLAB account, license file, or activation key is needed on Vercel.

The project registry must contain `dda-ubuntu:24.04`, copied from the official Ubuntu Linux/amd64 image pinned at `sha256:a2d43bffc46670d7108bb3c0468c67c5557c4c92e83e1e34cbff1322ad1b94dc`. MATLAB R2025a uses Ubuntu24.04 dependencies. The workflow installs the runtime once and caches a clean snapshot before any recording is loaded.

For local development, install Node.js22+ and pnpm11.25, then run:

```sh
cd web
pnpm install
pnpm dev
```

The interface can be previewed without credentials. Actual uploads and processing require the connected Blob store and Vercel compute access.

## Scientific processing

`DDA_prep.m` is retained unchanged. A deployment build adapter under `web/runner/matlab/` changes only resource/path initialization and wraps the recipe as a portable compiled Python package. Compile locally with MATLAB Compiler SDK; the generated archive runs using the freely available MATLAB Runtime.

The existing recipe expects continuous1000Hz HydroCel EDF recordings with E1–E129 plus Status. It validates event labels/times against the acquisition log and physical Status pulses, references E57/E100, filters57–63Hz and0.1–30Hz, detects/interpolates channels, resamples to250Hz, epochs−200 to+800ms, applies the−200 to0ms baseline, and flags artifacts at±4.5global SD. Selected electrodes may be averaged within each trial; individual trials remain separate. Pooled CT fits each condition separately, requiring at least two retained trials per selected condition.

The native Rust engine source and its MIT license are preserved in `web/runner/dda-rs/`. GitHub Actions builds/tests its Linux executable. Compiled preparation and native-engine artifacts are attached to GitHub Releases; the runtime setup verifies the preparation archive hash.

### Verification

The locally compiled preparation was checked against an untouched run of the original MATLAB script on the sample recording. Both data and counts CSVs were byte-identical:250 samples×283 retained trials, zero numeric difference. The web runner's pooled CT was checked across all6conditions and19windows against an independent NumPy least-squares calculation: maximum absolute a1difference1.74e−15. Linux/Vercel end-to-end verification is recorded separately as deployment is completed.

Executable checks:

```sh
cd web
pnpm test
pnpm typecheck
pnpm build
python tests/verify_native_parity.py /path/to/prepared.csv /path/to/ddalab
```

Each browser receives a separate signed upload session; recording history belongs to that browser session. Output downloads are authorized through the same session and use short-lived private storage URLs.

## Original desktop snapshot

The original folder remains at the repository root:

- `DDALab Pooled.app/`: existing Apple Silicon macOS app and dependencies.
- `DDA_prep.m`: original MATLAB preparation.
- `Sample_I1_R3_data/`: sample EDF, acquisition TXT log, conditions CSV.
- `programs/`: EEGLAB/ERPLAB with their existing license/attribution files.
- `read.txt`: original desktop instructions.
- `snapshot-manifest.json`: original copied file hashes and symlink targets.

EDF files use Git LFS. Install Git LFS before cloning to obtain the actual recordings. macOS metadata and nested `.git` metadata were omitted from the snapshot. The desktop `.app` is preserved as a reference and is not used as the Vercel executable.
