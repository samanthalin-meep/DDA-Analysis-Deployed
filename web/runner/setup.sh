#!/usr/bin/env bash
set -euo pipefail
cd /vercel/sandbox/dda
ROOT="$PWD"
stage() {
  printf '{"stage":"%s"}\n' "$1" > runtime-status.tmp
  mv runtime-status.tmp runtime-status.json
}
failed() {
  printf '%s\n' '{"error":"The analysis environment could not be prepared. Please retry; the installation log is available to the project owner."}' > runtime-status.tmp
  mv runtime-status.tmp runtime-status.json
}
trap failed ERR
exec > >(tee -a setup.log) 2>&1
stage 'Installing the analysis environment'
sudo apt-get update -qq
curl --fail --location --retry 3 https://raw.githubusercontent.com/mathworks-ref-arch/container-images/main/matlab-deps/r2025a/ubuntu24.04/base-dependencies-amd64.txt -o /tmp/matlab-deps.txt
# The official MathWorks dependency list contains one apt package per line.
mapfile -t packages < <(sed 's/#.*//' /tmp/matlab-deps.txt | awk 'NF {print $1}')
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends "${packages[@]}" python3.12 python3.12-venv unzip ca-certificates curl
stage 'Downloading the analysis environment · first recording only'
python3 download_assets.py
stage 'Installing MATLAB Runtime · first recording only'
mkdir -p runtime-installer matlab-runtime bin
unzip -q matlab-runtime.zip -d runtime-installer
runtime-installer/install -mode silent -agreeToLicense yes -destinationFolder "$ROOT/matlab-runtime"
tar -xzf preparation.tar.gz
tar -xzf engine.tar.gz -C bin
chmod +x bin/ddalab
python3.12 -m venv .venv
.venv/bin/python -m pip install --disable-pip-version-check numpy==1.26.4 ./dda-preparation
MCR="$ROOT/matlab-runtime/R2025a"
if [[ ! -d "$MCR/runtime/glnxa64" ]]; then MCR="$ROOT/matlab-runtime/v251"; fi
if [[ ! -d "$MCR/runtime/glnxa64" ]]; then MCR="$ROOT/matlab-runtime"; fi
test -d "$MCR/runtime/glnxa64"
cat > runtime-env.sh <<EOF
export LD_LIBRARY_PATH="$MCR/runtime/glnxa64:$MCR/bin/glnxa64:$MCR/sys/os/glnxa64:$MCR/extern/bin/glnxa64"
export MCR_CACHE_ROOT="$ROOT/mcr-cache"
export MATLAB_PREFDIR="$ROOT/matlab-prefs"
export DDA_ENGINE="$ROOT/bin/ddalab"
export OMP_NUM_THREADS=4
export OPENBLAS_NUM_THREADS=4
EOF
source runtime-env.sh
mkdir -p "$MCR_CACHE_ROOT" "$MATLAB_PREFDIR"
.venv/bin/python - <<'PY'
import dda_preparation
dda_preparation.initialize_runtime(['-nodisplay'])
p=dda_preparation.initialize()
p.terminate()
PY
bin/ddalab --version
rm -rf runtime-installer matlab-runtime.zip preparation.tar.gz engine.tar.gz
python3 - <<'PY'
import json
from pathlib import Path
Path('runtime-status.json').write_text(json.dumps({'ready':True,'stage':'Analysis environment ready'}))
PY
