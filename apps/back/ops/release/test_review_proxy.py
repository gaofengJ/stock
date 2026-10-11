import pathlib
import tempfile
import unittest
from unittest import mock
from importlib.machinery import SourceFileLoader

proxy = SourceFileLoader('review_proxy', str(pathlib.Path(__file__).parent/'review-proxy.py')).load_module()
FIXTURE = """events {} http {
server { listen 80; server_name other.example; location /api { proxy_pass http://127.0.0.1:3001; } }
server { listen 443; server_name stock.mufengtongxue.com;
location /api { proxy_set_header X-Original preserved; proxy_pass http://127.0.0.1:3000; }
location /blog-frame/ { proxy_pass http://127.0.0.1:8082/; }
}
server { listen 80; server_name stock.mufengtongxue.com; return 301 https://$host$request_uri; }
}"""


class ReviewProxyTests(unittest.TestCase):
    def test_scoped_idempotent_change_preserves_other_locations(self):
        result = proxy.render(FIXTURE)
        self.assertEqual(result.replace(proxy.RULE, ''), FIXTURE)
        self.assertEqual(proxy.render(result), result)
        self.assertEqual(result.count('client_max_body_size'), 2)
        self.assertIn('proxy_set_header X-Original preserved;', result)
        for text in [FIXTURE.replace('stock.mufengtongxue.com', 'other.example'), FIXTURE + FIXTURE, FIXTURE.replace('location /api {', 'location = /api/review/notebook {')]:
            with self.assertRaises(ValueError):
                proxy.render(text)

    def test_failed_validation_restores_original_and_keeps_backup(self):
        with tempfile.TemporaryDirectory() as directory:
            config = pathlib.Path(directory)/'nginx.conf'
            backup = pathlib.Path(directory)/'before.conf'
            config.write_text(FIXTURE)
            with mock.patch.object(proxy.subprocess, 'check_call', side_effect=[0, RuntimeError('invalid'), 0, 0]):
                with self.assertRaises(RuntimeError):
                    proxy.apply(str(config), str(backup))
            self.assertEqual(config.read_text(), FIXTURE)
            self.assertEqual(backup.read_text(), FIXTURE)
