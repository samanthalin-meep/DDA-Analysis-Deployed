"""Validate session archives before extracting them."""
from pathlib import PurePosixPath
import tarfile


def restore_archive(archive_path, destination, *, maximum_size=2 * 1024 ** 3):
    with tarfile.open(archive_path) as archive:
        members = archive.getmembers()
        total = 0
        for member in members:
            path = PurePosixPath(member.name)
            if not member.isfile() or path.is_absolute() or '..' in path.parts:
                raise ValueError('Invalid saved file.')
            total += member.size
            if total > maximum_size:
                raise ValueError('The saved files are too large.')
        archive.extractall(destination, members=members, filter='data')
