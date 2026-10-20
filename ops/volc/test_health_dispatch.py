import contextlib
import datetime as dt
import io
import json
from pathlib import Path
import tempfile
import unittest

import health_dispatch as h


class HealthDispatchTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name) / 'state.json'
        self.now = 1800000000
        self.runs = []
        self.posts = []
        self.error = None

    def run_record(self, age=0, status='completed', conclusion='success', event='schedule'):
        return dict(id=123, head_branch='master', status=status, conclusion=conclusion, event=event,
                    created_at=dt.datetime.fromtimestamp(self.now-age, dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'))

    def api(self, suffix, token, payload=None):
        if payload is not None:
            # Intent must already be durable before POST.
            self.assertEqual(json.loads(self.path.read_text())['pendingAt'], self.now)
            self.posts.append(payload)
            if self.error:
                raise self.error
            return {}
        if not suffix:
            return {'state': 'active'}
        return {'workflow_runs': self.runs}

    def check(self):
        with contextlib.redirect_stdout(io.StringIO()):
            return h.check('fixture', self.path, self.now, self.api)

    def test_stale_check_dispatches_then_waits_without_duplicate(self):
        self.runs = [self.run_record(age=1800)]
        self.assertEqual(self.check()['outcome'], 'dispatched')
        self.assertEqual(self.check()['outcome'], 'awaiting_dispatch_confirmation')
        self.assertEqual(self.posts, [{'ref': 'master'}])
        self.runs.insert(0, self.run_record(event='workflow_dispatch'))
        self.assertEqual(self.check()['outcome'], 'skipped_recent_run')
        self.assertNotIn('pendingAt', json.loads(self.path.read_text()))

    def test_recent_failure_is_reported_without_retry_storm(self):
        self.runs = [self.run_record(age=100, conclusion='failure')]
        result = self.check()
        self.assertEqual(result['outcome'], 'skipped_recent_run')
        self.assertEqual(result['latestConclusion'], 'failure')
        self.assertFalse(self.posts)

    def test_active_and_stuck_active_never_dispatch(self):
        for age, outcome in [(10, 'skipped_active_run'), (3600, 'blocked_stale_active')]:
            self.runs = [self.run_record(age=age, status='queued')]
            self.assertEqual(self.check()['outcome'], outcome)
        self.assertFalse(self.posts)

    def test_ambiguous_post_survives_network_error_and_backoff(self):
        self.error = h.ApiError(uncertain=True)
        with self.assertRaises(h.ApiError):
            self.check()
        self.assertEqual(self.check()['outcome'], 'backoff')
        self.now += 301
        def broken(*args, **kwargs):
            raise h.ApiError(503)
        with contextlib.redirect_stdout(io.StringIO()), self.assertRaises(h.ApiError):
            h.check('fixture', self.path, self.now, broken)
        self.assertIn('pendingAt', json.loads(self.path.read_text()))
        self.assertEqual(len(self.posts), 1)

    def test_uncertain_post_can_retry_only_after_confirmation_window(self):
        self.error = h.ApiError(uncertain=True)
        with self.assertRaises(h.ApiError):
            self.check()
        self.now += 1201
        self.error = None
        self.assertEqual(self.check()['outcome'], 'dispatched')
        self.assertEqual(len(self.posts), 2)

    def test_definitive_auth_failure_has_backoff(self):
        self.error = h.ApiError(403)
        with self.assertRaises(h.ApiError):
            self.check()
        self.assertNotIn('pendingAt', json.loads(self.path.read_text()))
        self.assertEqual(self.check()['outcome'], 'backoff')

    def test_corrupt_state_does_not_dispatch(self):
        self.path.write_text('{')
        with self.assertRaises(ValueError):
            self.check()
        self.assertFalse(self.posts)


if __name__ == '__main__':
    unittest.main()
