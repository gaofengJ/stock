import base64
import datetime as dt
import hashlib
from http.client import HTTPConnection
from http.server import HTTPServer
import json
from pathlib import Path
import subprocess
import tempfile
import threading
import unittest
from unittest.mock import patch

import feed_receiver
import news_http_receiver
import upload_news


class NewsHTTPReceiverTest(unittest.TestCase):
    def test_real_signature_receipt_and_rejected_requests(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            key = root / 'ci'
            subprocess.run(['ssh-keygen', '-q', '-t', 'ed25519', '-N', '', '-f', str(key)], check=True)
            signers = root / 'signers'
            signers.write_text('stock-news-ci ' + key.with_suffix('.pub').read_text())
            enabled = root / 'enabled'
            enabled.touch()
            now = dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
            item = {'id': 'https://finance.sina.com.cn/test', 'url': 'https://finance.sina.com.cn/test',
                    'title': '公开资讯', 'content_html': 'summary', 'date_published': now}
            raw = json.dumps({'source': 'sina-finance', 'generated_at': now, 'items': [item]}).encode()
            digest = hashlib.sha256(raw).hexdigest()
            check_signature = news_http_receiver.verified
            with HTTPServer(('127.0.0.1', 0), news_http_receiver.NewsHandler) as server:
                with (
                    patch.object(news_http_receiver, 'verified', side_effect=lambda cmd, sig: check_signature(cmd, sig, signers)),
                    patch.object(news_http_receiver, 'receive', side_effect=lambda cmd, body: feed_receiver.receive(cmd, body, root, enabled)),
                    patch.object(upload_news, 'HTTPS_URL', f'http://127.0.0.1:{server.server_port}{news_http_receiver.PATH}'),
                ):
                    thread = threading.Thread(target=server.serve_forever)
                    thread.start()
                    try:
                        self.assertFalse(upload_news.deliver_https(key, raw, 'sina', digest, 'validate')['published'])
                        self.assertFalse((root / 'sina.json').exists())
                        self.assertTrue(upload_news.deliver_https(key, raw, 'sina', digest, 'publish')['published'])
                        self.assertEqual(json.loads((root / 'sina.json').read_bytes()), json.loads(raw))
                        command = f'news validate sina {digest}'
                        signature = subprocess.run(
                            ['ssh-keygen', '-Y', 'sign', '-f', str(key), '-n', news_http_receiver.NAMESPACE],
                            input=command.encode(), capture_output=True, check=True,
                        ).stdout
                        headers = {'X-Stock-News-Command': command, 'X-Stock-News-Signature': base64.b64encode(signature).decode()}
                        self.assertEqual(self.post(server, raw + b' ', headers), 422)
                        self.assertEqual(self.post(server, raw, dict(headers, **{'X-Stock-News-Command': command.replace('validate', 'publish')})), 403)
                        self.assertEqual(self.post(server, raw, {}), 403)
                    finally:
                        server.shutdown()
                        thread.join()

    def post(self, server, raw, headers):
        connection = HTTPConnection('127.0.0.1', server.server_port, timeout=3)
        try:
            connection.request('POST', news_http_receiver.PATH, raw, headers)
            with connection.getresponse() as response:
                response.read()
                return response.status
        finally:
            connection.close()


if __name__ == '__main__':
    unittest.main()
