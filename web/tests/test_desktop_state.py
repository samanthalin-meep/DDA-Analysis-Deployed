"""Saved sessions must not write outside the assigned user folder."""
import io
from pathlib import Path
import sys
import tarfile
import tempfile
import unittest
sys.path.insert(0, str(Path(__file__).parents[1] / 'desktop'))
from state_archive import restore_archive


class DesktopStateTest(unittest.TestCase):
    def archive(self, root, name, data=b'abc', kind=tarfile.REGTYPE):
        path = root / 'state.tar.gz'
        with tarfile.open(path, 'w:gz') as archive:
            member = tarfile.TarInfo(name)
            member.size = len(data) if kind == tarfile.REGTYPE else 0
            member.type = kind
            member.linkname = '../../outside'
            archive.addfile(member, io.BytesIO(data))
        return path

    def test_restores_data_at_the_same_relative_path(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            destination = root / 'user'
            destination.mkdir()
            restore_archive(self.archive(root, 'data/recording/trials.csv'), destination)
            self.assertEqual((destination / 'data/recording/trials.csv').read_bytes(), b'abc')

    def test_rejects_path_traversal_absolute_paths_and_links(self):
        for name, kind in [('../outside', tarfile.REGTYPE), ('/outside', tarfile.REGTYPE),
                           ('data/link', tarfile.SYMTYPE), ('data/link', tarfile.LNKTYPE)]:
            with self.subTest(name=name, kind=kind), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                with self.assertRaisesRegex(ValueError, 'Invalid saved file'):
                    restore_archive(self.archive(root, name, kind=kind), root / 'user')
                self.assertFalse((root / 'outside').exists())

    def test_rejects_oversized_archive_before_extracting(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with self.assertRaisesRegex(ValueError, 'too large'):
                restore_archive(self.archive(root, 'data.csv'), root / 'user', maximum_size=2)
            self.assertFalse((root / 'user/data.csv').exists())


if __name__ == '__main__':
    unittest.main()
