"""Package only generated runtime files and attribution; never MATLAB licenses."""

import argparse
import hashlib
import json
import shutil
import tarfile
from pathlib import Path


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def package(repository: Path, build: Path, destination: Path) -> dict:
    source = build / 'python-package'
    destination.mkdir(parents=True, exist_ok=False)
    payload = destination / 'dda-preparation'
    payload.mkdir()
    for name in ('setup.py', 'pyproject.toml', 'buildresult.json', 'requiredMCRProducts.txt'):
        shutil.copy2(source / name, payload / name)
    module = payload / 'dda_preparation'
    module.mkdir()
    for name in ('__init__.py', 'dda_preparation.ctf'):
        shutil.copy2(source / 'dda_preparation' / name, module / name)
    shutil.copy2(repository / 'web/runner/matlab/README.md', payload / 'README.md')
    notices = payload / 'notices'
    notices.mkdir()
    shutil.copy2(repository / 'programs/eeglab2026.0.0/LICENSE', notices / 'EEGLAB-LICENSE.txt')
    shutil.copy2(repository / 'programs/eeglab2026.0.0/plugins/Biosig3.8.5/biosig/LICENSE',
                 notices / 'BIOSIG-LICENSE.txt')
    shutil.copy2(repository / 'programs/erplab12.20/README.md', notices / 'ERPLAB-README.md')
    for relative, name in (
        ('programs/erplab12.20/pop_functions/pop_artextval.m', 'ERPLAB-COPYRIGHT.txt'),
        ('programs/eeglab2026.0.0/plugins/firfilt/firfilt.m', 'FIRFILT-COPYRIGHT.txt'),
    ):
        source_bytes = (repository / relative).read_bytes()
        try:
            source_text = source_bytes.decode('utf-8')
        except UnicodeDecodeError:
            source_text = source_bytes.decode('cp1252')
        lines = source_text.splitlines()
        comments = []
        started = False
        for line in lines:
            if line.lstrip().startswith('%'):
                comments.append(line)
                started = True
            elif started and line.strip():
                break
        (notices / name).write_text('\n'.join(comments) + '\n')
    manifest = json.loads((build / 'runtime-version.json').read_text())
    manifest.update({
        'sourceRepository': 'https://github.com/samanthalin-meep/DDA-Analysis-Deployed',
        'preparationSourceSHA256': sha256(repository / 'DDA_prep.m'),
        'compiledArchiveSHA256': sha256(module / 'dda_preparation.ctf'),
        'runtimeLicenseRequired': False,
        'python': '3.12',
        'linuxRuntimeURL': (
            'https://ssd.mathworks.com/supportfiles/downloads/R2025a/Release/1/'
            'deployment_files/installer/complete/glnxa64/'
            'MATLAB_Runtime_R2025a_Update_1_glnxa64.zip'
        ),
    })
    (payload / 'runtime-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    archive = destination / 'dda-preparation-r2025a-u1.tar.gz'
    with tarfile.open(archive, 'w:gz') as tar:
        tar.add(payload, arcname='dda-preparation')
    manifest['packageArchiveSHA256'] = sha256(archive)
    manifest['packageArchiveBytes'] = archive.stat().st_size
    manifest['packageArchiveFilename'] = archive.name
    (destination / 'runtime-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    return manifest


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('repository', type=Path)
    parser.add_argument('build', type=Path)
    parser.add_argument('destination', type=Path)
    args = parser.parse_args()
    print(json.dumps(package(args.repository, args.build, args.destination), indent=2))
