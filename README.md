# DDA-Analysis-Deployed

Starting snapshot of the DDALab desktop workflow for development of a Vercel-hosted web application.

## Contents

- `DDA_prep.m`: MATLAB preparation of EEG trials using EEGLAB and ERPLAB.
- `DDALab Pooled.app/`: the existing macOS desktop application, including its bundled analysis engine and dependencies. Symlinks and executable file modes are preserved.
- `Sample_I1_R3_data/`: the sample EDF recording, acquisition TXT log, and conditions CSV.
- `programs/`: bundled EEGLAB and ERPLAB dependencies, including their existing license and attribution files.
- `read.txt`: original instructions for the desktop workflow.
- `snapshot-manifest.json`: SHA-256 hashes of copied files and targets of preserved symlinks.

The web application and Vercel deployment have not yet been implemented. The macOS application bundle is retained as a reference and is not directly executable on Vercel's Linux infrastructure. Editable pooled-app sources outside the original DDALab folder are not part of this initial snapshot.

## Download the complete repository

Install Git LFS before cloning. The EDF recording exceeds GitHub's normal file-size limit and is stored with Git LFS.

```sh
git lfs install
git clone https://github.com/samanthalin-meep/DDA-Analysis-Deployed.git
cd DDA-Analysis-Deployed
git lfs pull
```

A source ZIP downloaded from GitHub may contain an LFS pointer instead of the EDF recording; use Git LFS to obtain the actual data file.

## Existing desktop workflow

Run `DDA_prep` in MATLAB and select the folder containing one EDF recording, one TXT acquisition log, and one conditions CSV. Select the recording ID, electrodes, conditions, and electrode export mode. Open the resulting data CSV in DDALab Pooled for analysis. See `read.txt` for the original instructions.

## Snapshot details

Copied on October 23, 2026. Files were verified against the source folder after copying. Only macOS metadata (`.DS_Store` and AppleDouble files) and nested `.git` metadata were omitted. Dependency code is included as ordinary repository files rather than external submodules. No new license is imposed on the bundled third-party software.
