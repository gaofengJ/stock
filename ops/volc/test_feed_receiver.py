import datetime as dt
import hashlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import feed_receiver


class FeedReceiverTest(unittest.TestCase):
    def setUp(self):
        now = dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
        self.feed = {'source': 'sina-finance', 'generated_at': now, 'items': [{
            'id': 'https://finance.sina.com.cn/test', 'url': 'https://finance.sina.com.cn/test',
            'title': '测试', 'content_html': 'summary', 'date_published': now}]}

    def invoke(self, root, mode='validate', raw=None):
        raw = raw if raw is not None else json.dumps(self.feed).encode()
        command = 'news ' + mode + ' sina ' + hashlib.sha256(raw).hexdigest()
        return feed_receiver.receive(command, io.BytesIO(raw), root, root / 'enabled')

    def test_validation_does_not_create_files_and_publish_requires_cutover_flag(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.assertFalse(self.invoke(root)['published'])
            self.assertEqual(list(root.iterdir()), [])
            with self.assertRaisesRegex(ValueError, 'not been enabled'):
                self.invoke(root, 'publish')
            self.assertEqual(list(root.iterdir()), [])

    def test_bad_checksum_oversize_and_command_injection_are_rejected(self):
        with self.assertRaises(ValueError):
            feed_receiver.receive('news validate sina ' + '0' * 64, io.BytesIO(b'{}'))
        with self.assertRaises(ValueError):
            feed_receiver.receive('news validate sina ' + '0' * 64 + '; id', io.BytesIO(b'{}'))
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(ValueError):
                self.invoke(Path(tmp), raw=b'a' * (feed_receiver.MAX_BYTES + 1))

    def test_atomic_replacement_and_invalid_feed_preserves_previous(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / 'enabled').touch()
            target = root / 'sina.json'
            self.assertTrue(self.invoke(root, 'publish')['published'])
            previous = target.read_bytes()
            with self.assertRaises(ValueError):
                self.invoke(root, 'publish', b'{}')
            self.assertEqual(target.read_bytes(), previous)
            with patch('pathlib.Path.replace', side_effect=OSError('disk failure')):
                with self.assertRaises(OSError):
                    self.invoke(root, 'publish')
            self.assertEqual(target.read_bytes(), previous)
            self.assertEqual(list(root.glob('.delivery-*')), [])

    def test_replay_after_lost_receipt_is_idempotent(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / 'enabled').touch()
            first = self.invoke(root, 'publish')
            data = (root / 'sina.json').read_bytes()
            self.assertEqual(self.invoke(root, 'publish'), first)
            self.assertEqual((root / 'sina.json').read_bytes(), data)

    def test_newer_existing_feed_cannot_be_replaced(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / 'enabled').touch()
            newer = dict(self.feed, generated_at='2099-01-01T00:00:00Z')
            (root / 'sina.json').write_text(json.dumps(newer))
            with self.assertRaisesRegex(ValueError, 'newer'):
                self.invoke(root, 'publish')


if __name__ == '__main__':
    unittest.main()
