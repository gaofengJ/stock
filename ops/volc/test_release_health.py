import io
import json
import unittest
from unittest.mock import patch, MagicMock
from urllib.error import HTTPError, URLError

import release_worker as worker


class ReleaseHealthTest(unittest.TestCase):
    def test_reload_old_upstream_failure_then_denial_is_healthy(self):
        url = 'http://127.0.0.1:8082/'
        errors = [HTTPError(url, 500, 'old worker', {}, None),
                  HTTPError(url, 403, 'denied', {}, None)]
        with patch.object(worker.urllib.request, 'urlopen', side_effect=errors) as opened, \
                patch.object(worker.time, 'sleep') as sleep:
            worker.wait_http_status(url, 403)
        self.assertEqual(opened.call_count, 2)
        sleep.assert_called_once()

    def test_anonymous_success_is_never_retried_or_accepted(self):
        response = MagicMock()
        response.__enter__.return_value.status = 200
        with patch.object(worker.urllib.request, 'urlopen', return_value=response) as opened, \
                patch.object(worker.time, 'sleep') as sleep, patch('sys.stdout', new_callable=io.StringIO):
            with self.assertRaisesRegex(ValueError, '"actual": 200'):
                worker.wait_http_status('http://127.0.0.1:8082/', 403)
        self.assertEqual(opened.call_count, 1)
        sleep.assert_not_called()

    def test_connection_failure_stops_at_deadline_with_diagnostics(self):
        with patch.object(worker.urllib.request, 'urlopen', side_effect=URLError('unavailable')), \
                patch.object(worker.time, 'monotonic', side_effect=[0, 0, 31]), \
                patch('sys.stdout', new_callable=io.StringIO) as output:
            with self.assertRaisesRegex(ValueError, '"expected": 200'):
                worker.wait_http_status('http://127.0.0.1:8081/', 200)
        self.assertIn('RELEASE_HEALTH_FAILED', output.getvalue())

    def test_full_health_reloads_before_all_endpoint_checks(self):
        events = []
        def run(command):
            events.append(command)
            return json.dumps([{'State': {'Status': 'running', 'Health': {'Status': 'healthy'}}}]).encode()
        with patch.object(worker, 'run', side_effect=run), \
                patch.object(worker, 'wait_http_status', side_effect=lambda url, status: events.append((url, status))):
            worker.healthy(True)
        self.assertEqual(events[2][-3:], ['nginx', '-s', 'reload'])
        self.assertEqual([event[1] for event in events[3:]], [200, 401, 403])


if __name__ == '__main__':
    unittest.main()
