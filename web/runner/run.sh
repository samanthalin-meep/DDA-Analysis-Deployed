#!/usr/bin/env bash
set -euo pipefail
cd /vercel/sandbox/dda
source runtime-env.sh
exec .venv/bin/python job.py
