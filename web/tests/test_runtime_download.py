"""Exercise range assembly and reject a server that ignores Range requests."""
import importlib.util
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import tempfile
from threading import Thread
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('download_assets', Path(__file__).parents[1] / 'runner' / 'download_assets.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
PAYLOAD = bytes(range(256)) * 399 + b'last-seven'


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def do_HEAD(self):
        self.send_response(200)
        self.send_header('Content-Length', str(len(PAYLOAD)))
        self.end_headers()

    def do_GET(self):
        start, end = map(int, self.headers['Range'].removeprefix('bytes=').split('-'))
        self.send_response(200 if self.path == '/ignored' else 206)
        self.send_header('Content-Range', f'bytes {start}-{end}/{len(PAYLOAD)}')
        self.send_header('Content-Length', str(end - start + 1))
        self.end_headers()
        self.wfile.write(PAYLOAD[start:end + 1])


class RuntimeDownloadTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        Thread(target=cls.server.serve_forever, daemon=True).start()
        cls.url = f'http://127.0.0.1:{cls.server.server_port}'

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def test_reassembles_unequal_ranges_without_missing_or_reordered_bytes(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / 'runtime.zip'
            module.download_runtime(self.url + '/valid', target)
            self.assertEqual(target.read_bytes(), PAYLOAD)
            self.assertEqual(list(Path(directory).iterdir()), [target])

    def test_rejects_server_that_ignores_requested_ranges(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(module.time, 'sleep'):
            target = Path(directory) / 'runtime.zip'
            with self.assertRaisesRegex(RuntimeError, 'invalid byte range'):
                module.download_runtime(self.url + '/ignored', target)
            self.assertFalse(target.exists())


if __name__ == '__main__':
    unittest.main()
