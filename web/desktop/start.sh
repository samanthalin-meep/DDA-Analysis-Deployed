#!/usr/bin/env bash
set -euo pipefail
cd /vercel/sandbox/ddalab
exec > >(tee -a program.log) 2>&1
export DDALAB_CLI_PATH="$PWD/bin/ddalab"
export PYTHONPATH="$PWD/vendor"
export QT_X11_NO_MITSHM=1
export DISPLAY=:80
export OMP_NUM_THREADS=2
export OPENBLAS_NUM_THREADS=2
read -r width height < <(.venv/bin/python -c 'import json; c=json.load(open("session-config.json")); print(c["width"],c["height"])')
Xvfb :80 -screen 0 "${width}x${height}x24" -nolisten tcp -noreset &
for i in {1..50}; do [[ -S /tmp/.X11-unix/X80 ]] && break; sleep .1; done
openbox --sm-disable &
x11vnc -display :80 -localhost -rfbport 5900 -nopw -forever -shared -noxdamage -quiet &
exec .venv/bin/python gui.py
