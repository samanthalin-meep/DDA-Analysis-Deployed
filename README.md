# DDA Analysis

**[Open DDALAB Pooled](https://samanthalin-meep.github.io/DDA-Analysis-Deployed/)**

The free browser app runs on GitHub Pages. Each push to `main` builds and deploys the website with GitHub Actions.

1. Select **Upload recording**. Select the EDF, acquisition TXT, and conditions CSV from one recording.
2. Select electrodes and conditions. Select **Run preparation**.
3. Set the trials and DDA settings on the same page. Select **Run DDA**.
4. View the results. Download data, plots, or a `.ddalab` session.

Preparation and analysis run on the visitor's device. Files and results stay in the browser. Visitors do not need MATLAB or a server account. Prepared CSV files and saved sessions can also be opened directly.

The app reuses the original Rust DDA engine through WebAssembly. NumPy/SciPy runs the browser translation of the MATLAB/EEGLAB preparation recipe. See [`pages/README.md`](pages/README.md) for features, numerical validation, build steps, and browser limits.

## Source

- [`pages/`](pages/): browser app, preparation port, tests, and build scripts.
- [`vendor/dda-rs/`](vendor/dda-rs/): preserved numerical engine and MIT license.
- [`reference/desktop/`](reference/desktop/): original Python desktop source for interface and format reference.
- [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml): automatic GitHub Pages build and deployment.

## Original desktop snapshot

The original folder remains at the repository root:

- `DDALab Pooled.app/`: Apple Silicon macOS app and dependencies.
- `DDA_prep.m`: original MATLAB preparation.
- `Sample_I1_R3_data/`: sample EDF, acquisition TXT log, and conditions CSV.
- `programs/`: EEGLAB/ERPLAB with their existing license and attribution files.
- `read.txt`: original desktop instructions.
- `snapshot-manifest.json`: original file hashes and symlink targets.

EDF files use Git LFS. Install Git LFS before cloning to obtain the recordings. macOS metadata and nested `.git` metadata were omitted from the snapshot.
