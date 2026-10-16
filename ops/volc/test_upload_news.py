import hashlib
import io
import json
import subprocess
import unittest
from contextlib import redirect_stdout, redirect_stderr
from unittest.mock import patch

import upload_news
import news_delivery_status


class UploadNewsTest(unittest.TestCase):
    raw = b'{"source":"fixture"}'
    digest = hashlib.sha256(raw).hexdigest()
    command = ['ssh', 'fixture']

    def success(self, **changes):
        receipt = dict(source='sina', sha256=self.digest, published=True)
        receipt.update(changes)
        return subprocess.CompletedProcess(self.command, 0, json.dumps(receipt).encode(), b'')

    def error(self, message, code=255):
        return subprocess.CalledProcessError(code, self.command, stderr=message.encode())

    def send(self):
        return upload_news.deliver(self.command, self.raw, 'sina', self.digest, 'publish')

    @patch('upload_news.time.sleep')
    @patch('upload_news.subprocess.run')
    def test_transport_retry_replays_same_bytes_and_requires_matching_receipt(self, run, sleep):
        run.side_effect = [self.error('Connection reset by peer'),
                           self.error('ssh: connect to host fixture port 22: Connection timed out'), self.success()]
        self.assertTrue(self.send()['published'])
        self.assertEqual(run.call_count, 3)
        self.assertEqual(sleep.call_count, 2)
        for call in run.call_args_list:
            self.assertEqual(call.kwargs['input'], self.raw)
            self.assertLessEqual(call.kwargs['timeout'], 30)

    @patch('upload_news.time.sleep')
    @patch('upload_news.subprocess.run')
    def test_auth_host_key_unknown_and_receiver_errors_fail_immediately(self, run, sleep):
        for error in [self.error('Permission denied (publickey).'),
                      self.error('Host key verification failed. Connection closed'),
                      self.error('WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!'),
                      self.error('some unexpected error'), self.error('Refusing to replace a newer feed', 1)]:
            with self.subTest(error=error.stderr):
                run.reset_mock(); run.side_effect = error
                with self.assertRaisesRegex(RuntimeError, 'non-retryable'): self.send()
                run.assert_called_once()
        sleep.assert_not_called()

    @patch('upload_news.time.sleep')
    @patch('upload_news.subprocess.run')
    def test_lost_receipt_timeout_can_retry(self, run, sleep):
        run.side_effect = [subprocess.TimeoutExpired(self.command, 30), self.success()]
        self.assertEqual(self.send()['sha256'], self.digest)
        self.assertEqual(run.call_count, 2)

    @patch('upload_news.time.sleep')
    @patch('upload_news.subprocess.run')
    def test_attempts_and_total_deadline_are_bounded(self, run, sleep):
        run.side_effect = self.error('Connection closed')
        with self.assertRaisesRegex(RuntimeError, 'exhausted'): self.send()
        self.assertEqual(run.call_count, 4)
        run.reset_mock(); sleep.reset_mock()
        with patch('upload_news.time.monotonic', side_effect=[0, 0, 89]):
            with self.assertRaisesRegex(RuntimeError, 'exhausted'): self.send()
        run.assert_called_once(); sleep.assert_not_called()

    @patch('upload_news.time.sleep')
    @patch('upload_news.subprocess.run')
    def test_invalid_receipts_do_not_retry_or_claim_delivery(self, run, sleep):
        for changes in [dict(sha256='0'*64), dict(source='bloomberg'), dict(published=False), dict(published=1)]:
            run.side_effect = None; run.return_value = self.success(**changes); run.reset_mock()
            with self.assertRaises(ValueError): self.send()
            run.assert_called_once()
        run.return_value = subprocess.CompletedProcess(self.command, 0, b'invalid JSON', b'')
        with self.assertRaises(ValueError): self.send()
        sleep.assert_not_called()

    @patch('upload_news.subprocess.run')
    def test_validate_never_accepts_a_publish_receipt(self, run):
        run.return_value = self.success()
        with self.assertRaises(ValueError):
            upload_news.deliver(self.command, self.raw, 'sina', self.digest, 'validate')


class DeliveryReportTest(unittest.TestCase):
    def report(self, **changes):
        outcomes = {k: 'success' for k in ['BLOOMBERG_COLLECTION','SINA_COLLECTION',
                     'BLOOMBERG_DELIVERY','SINA_DELIVERY','TRANSLATION_DELIVERY']}
        outcomes.update(changes)
        output = io.StringIO()
        with redirect_stdout(output): result = news_delivery_status.report(outcomes)
        return result, output.getvalue()

    def test_partial_failure_names_failed_source_and_preserves_failure_status(self):
        result, text = self.report(SINA_DELIVERY='failure', TRANSLATION_DELIVERY='failure')
        self.assertEqual(result, 1)
        self.assertIn('source=bloomberg collected=True delivered=True', text)
        self.assertIn('::error::sina', text)
        self.assertNotIn('feeds have already been delivered', text)

    def test_translation_fallback_is_warning_when_originals_succeeded(self):
        result, text = self.report(TRANSLATION_DELIVERY='failure')
        self.assertEqual(result, 0); self.assertIn('::warning::', text)

    def test_skipped_collection_or_delivery_still_fails(self):
        self.assertEqual(self.report(BLOOMBERG_COLLECTION='skipped', BLOOMBERG_DELIVERY='skipped')[0], 1)


if __name__ == '__main__': unittest.main()
