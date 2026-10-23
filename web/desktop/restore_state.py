"""Restore only ordinary files into this user's data directory."""
import json
from pathlib import Path
import urllib.request
from state_archive import restore_archive

ROOT = Path(__file__).resolve().parent
config = json.loads((ROOT / 'session-config.json').read_text())
url = config.get('restoreUrl')
if url:
    destination = ROOT / 'restore.tar.gz'
    urllib.request.urlretrieve(url, destination)
    user = ROOT / 'user'
    user.mkdir(exist_ok=True)
    restore_archive(destination, user)
    destination.unlink()
