#!/usr/bin/env bash
set -euo pipefail
cd /vercel/sandbox/ddalab
exec > >(tee -a setup.log) 2>&1
trap 'printf "{\"error\":\"Cannot install DDALab.\"}" > setup-status.json' ERR
printf '{"stage":"Install DDALab."}' > setup-status.json
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends python3.12 python3.12-venv curl ca-certificates xvfb x11vnc openbox libegl1 libopengl0 libgl1 libxkbcommon0 libxkbcommon-x11-0 libxcb-xkb1 libxcb-cursor0 libxcb-xinerama0 libxcb-icccm4 libxcb-keysyms1 libxcb-render-util0 libxcb-shape0 libxcb-xfixes0 libdbus-1-3 libfontconfig1 libx11-xcb1 fonts-dejavu-core
python3.12 -m venv .venv
.venv/bin/python -m pip install --disable-pip-version-check -r requirements.txt
mkdir -p bin
curl --fail --location --retry 3 https://github.com/samanthalin-meep/DDA-Analysis-Deployed/releases/download/engine-v1/ddalab-linux-x64.tar.gz -o /tmp/dda-engine.tar.gz
tar -xzf /tmp/dda-engine.tar.gz -C bin
chmod +x bin/ddalab
bin/ddalab --version
rm -f /tmp/dda-engine.tar.gz
apt-get clean
rm -rf /root/.cache/pip /var/lib/apt/lists/*
sync
available=$(df --output=avail -B1 / | tail -n 1)
blocks=$((available / 16777216 - 16))
if (( blocks > 0 )); then
  dd if=/dev/zero of=/tmp/dda-empty-space bs=16M count="$blocks" conv=fsync status=none
  rm -f /tmp/dda-empty-space
  sync
fi
printf '{"ready":true}' > setup-status.json
