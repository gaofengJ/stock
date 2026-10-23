#!/usr/bin/python3
"""Supplement GitHub cron; never perform a deployment or modify the monitored host."""
import datetime as dt
import fcntl
import json
import http.client
import re
import os
from pathlib import Path
import tempfile
import time
import urllib.error
import urllib.request

API = 'https://api.github.com/repos/gaofengJ/stock/actions/workflows/volc-health.yml'
ACTIVE = {'queued', 'in_progress', 'waiting', 'pending', 'requested'}
STALE = 20 * 60
STATE = Path('/var/lib/stock-health-dispatch/status.json')


class ApiError(Exception):
    def __init__(self, status=None, uncertain=False, category=None):
        self.uncertain = uncertain
        self.category = category or ('http' if status else 'network')
        super().__init__('GitHub HTTP {}'.format(status) if status else 'GitHub ' + self.category + ' failure')


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def request(suffix, token, payload=None):
    data = json.dumps(payload).encode() if payload is not None else None
    opener = urllib.request.build_opener(NoRedirect())
    req = urllib.request.Request(API + suffix, data=data, headers={
        'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json', 'User-Agent': 'stock-health-dispatch',
        'X-GitHub-Api-Version': '2022-11-28'})
    attempts = 3 if data is None else 1
    for attempt in range(attempts):
        started = time.monotonic()
        details = {'method': 'POST' if data is not None else 'GET',
                   'stage': 'dispatch' if data is not None else ('runs' if suffix else 'workflow'),
                   'attempt': attempt + 1}
        category, status, retry = 'network', None, True
        try:
            with opener.open(req, timeout=15) as response:
                headers = getattr(response, 'headers', {})
                length = headers.get('Content-Length')
                expected = int(length) if length and length.isdigit() else None
                request_id = headers.get('X-GitHub-Request-Id', '')
                details.update(status=getattr(response, 'status', None), expectedBytes=expected,
                               requestId=request_id if re.match(r'^[A-Za-z0-9:-]{1,128}$', request_id) else None)
                raw = response.read((2 * 1024 * 1024) + 1)
                details['receivedBytes'] = len(raw)
                if len(raw) > (2 * 1024 * 1024) or (expected is not None and expected > (2 * 1024 * 1024)):
                    raise ApiError(uncertain=data is not None, category='response_too_large')
                if expected is not None and len(raw) != expected:
                    raise http.client.IncompleteRead(raw)
                return json.loads(raw.decode('utf-8')) if raw else {}
        except urllib.error.HTTPError as error:
            status, category = error.code, 'http'
            retry = status in (429, 500, 502, 503, 504) or (status == 403 and error.headers.get('X-RateLimit-Remaining') == '0')
        except http.client.IncompleteRead:
            category = 'incomplete_response'
        except (urllib.error.URLError, OSError, http.client.HTTPException) as error:
            details['exceptionType'] = type(error).__name__
        except (ValueError, UnicodeError):
            category = 'invalid_json'
        except ApiError as error:
            category, retry = error.category, False
        details.update(category=category, status=status or details.get('status'),
                       elapsedMs=int((time.monotonic() - started) * 1000))
        # Never log request headers, bodies or arbitrary exception messages.
        print('HEALTH_API_ERROR ' + json.dumps(details), flush=True)
        if retry and attempt + 1 < attempts:
            time.sleep(2 ** (attempt + 1))
            continue
        uncertain = data is not None and (status is None or status >= 500)
        raise ApiError(status, uncertain=uncertain, category=category)

def stamp(value):
    return dt.datetime.strptime(value, '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=dt.timezone.utc).timestamp()


def save(path, state):
    fd, temporary = tempfile.mkstemp(dir=path.parent, prefix='.health-dispatch-')
    try:
        with os.fdopen(fd, 'w') as stream:
            json.dump(state, stream)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def check(token, path=STATE, now=None, api=request):
    now = time.time() if now is None else now
    # Corrupt state must fail closed: it may contain an unconfirmed POST intent.
    state = json.loads(path.read_text()) if path.exists() else {}
    if not isinstance(state, dict):
        raise ValueError('Invalid dispatch state')
    state['checkedAt'] = now

    def finish(outcome, **fields):
        if outcome not in ('backoff', 'api_failed', 'dispatch_uncertain'):
            state['successfulCheckAt'] = now
        state.update(outcome=outcome, **fields)
        save(path, state)
        print(json.dumps(state))
        return state

    if now < state.get('retryAfter', 0):
        return finish('backoff')
    posting = False
    prior_failures = state.get('failures', 0)
    try:
        workflow = api('', token)
        if workflow.get('state') != 'active':
            raise ValueError('Health workflow is not active')
        result = api('/runs?branch=master&per_page=10', token)
        runs = result['workflow_runs']
        if not isinstance(runs, list):
            raise ValueError('Invalid run response')
        runs = [r for r in runs if r['head_branch'] == 'master']
        runs.sort(key=lambda r: stamp(r['created_at']), reverse=True)
        latest = runs[0] if runs else None
        completed = next((r for r in runs if r['status'] == 'completed'), None)
        state.update(latestRunId=latest['id'] if latest else None,
                     latestRunAgeSeconds=max(0, int(now - stamp(latest['created_at']))) if latest else None,
                     latestCompletedRunId=completed['id'] if completed else None,
                     latestConclusion=completed.get('conclusion') if completed else None)
        state.pop('lastError', None)
        state.pop('activeRunId', None)
        state.update(failures=0, retryAfter=0)
        pending = state.get('pendingAt')
        if pending is not None:
            confirmed = next((r for r in runs if r['event'] == 'workflow_dispatch'
                              and stamp(r['created_at']) >= pending - 5), None)
            if confirmed:
                state.pop('pendingAt')
                state['confirmedRunId'] = confirmed['id']
            elif now - pending < STALE:
                return finish('awaiting_dispatch_confirmation')
            else:
                state.pop('pendingAt')
        active = next((r for r in runs if r['status'] in ACTIVE), None)
        if active:
            return finish('blocked_stale_active' if now - stamp(active['created_at']) > STALE
                          else 'skipped_active_run', activeRunId=active['id'])
        if latest and now - stamp(latest['created_at']) <= STALE:
            return finish('skipped_recent_run', failures=0, retryAfter=0)
        if now - state.get('lastDispatchAt', 0) < STALE:
            return finish('skipped_recent_dispatch')
        # Old queued runs can fall outside the recent page. Query each active
        # status before POST instead of downloading megabytes of completed runs.
        for status in sorted(ACTIVE):
            active_runs = api('/runs?branch=master&per_page=1&status=' + status, token)['workflow_runs']
            if not isinstance(active_runs, list):
                raise ValueError('Invalid active run response')
            active = next((r for r in active_runs if r['head_branch'] == 'master' and r['status'] in ACTIVE), None)
            if active:
                return finish('blocked_stale_active' if now - stamp(active['created_at']) > STALE
                              else 'skipped_active_run', activeRunId=active['id'])
        state['pendingAt'] = now
        save(path, state)  # Durable intent before a potentially ambiguous POST.
        posting = True
        api('/dispatches', token, {'ref': 'master'})
        return finish('dispatched', lastDispatchAt=now, failures=0, retryAfter=0)
    except ApiError as error:
        if posting and not error.uncertain:
            state.pop('pendingAt', None)
        failures = min(prior_failures + 1, 4)
        finish('dispatch_uncertain' if error.uncertain else 'api_failed',
               failures=failures, retryAfter=now + min(300 * 2 ** (failures - 1), 1800),
               lastError=str(error))
        raise


def main():
    os.umask(0o077)
    token = os.environ.get('NEWS_DISPATCH_TOKEN', '')
    if not token:
        raise ValueError('Missing dispatch credential')
    with (STATE.parent / 'dispatch.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print('health-dispatch skipped-local-lock')
            return
        check(token)


if __name__ == '__main__':
    try:
        main()
    except (ApiError, ValueError, KeyError, TypeError, OSError) as error:
        print('HEALTH_DISPATCH_ERROR ' + (str(error) if isinstance(error, ApiError) else type(error).__name__))
        raise SystemExit(1)
