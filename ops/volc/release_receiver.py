#!/usr/bin/python3
"""The CI key can validate/queue fixed releases or read a sanitized receipt, never run shell."""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import tempfile
import uuid
from release_contract import MAX_BYTES, validate_request

QUEUE = Path('/run/stock-cd/queue')
STATUS = Path('/srv/stock/deploy-status')
# The upload user cannot traverse /etc/stock (runtime secrets). This public marker
# contains no data and is writable only by root. The root worker also checks production.enabled.
ENABLED = Path('/srv/stock/state/cd.enabled')


def receive(command, stream, queue=QUEUE, status=STATUS, enabled=ENABLED):
    query = re.fullmatch(r'release status ([a-f0-9]{32})', command)
    if query:
        path = status / (query[1] + '.json')
        return json.loads(path.read_text()) if path.is_file() else {'id': query[1], 'state': 'pending'}
    match = re.fullmatch(r'release (validate|queue) ([a-f0-9]{64})', command)
    if not match:
        raise ValueError('Only a bounded release request or status query is allowed')
    raw = stream.read(MAX_BYTES + 1)
    if not raw or len(raw) > MAX_BYTES or hashlib.sha256(raw).hexdigest() != match[2]:
        raise ValueError('Incomplete or oversized release request')
    request = validate_request(json.loads(raw))
    if match[1] == 'validate':
        return {'state': 'validated-not-queued', 'commit': request['commit']}
    if not enabled.is_file():
        raise ValueError('Production CD has not been enabled')
    # /run is tmpfs: registry authentication is never written into durable artifacts/logs.
    with (queue / '.queue.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        if len(list(queue.glob('*.json'))) >= 2:
            raise ValueError('A release queue is already occupied')
        identity = uuid.uuid4().hex
        fd, temporary = tempfile.mkstemp(prefix='.request-', dir=queue)
        try:
            with os.fdopen(fd, 'wb') as out:
                out.write(raw); out.flush(); os.fsync(out.fileno())
            os.replace(temporary, queue / (identity + '.json'))
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)
    return {'id': identity, 'state': 'queued', 'commit': request['commit']}


if __name__ == '__main__':
    try:
        os.umask(0o077)
        print(json.dumps(receive(os.environ.get('SSH_ORIGINAL_COMMAND', ''), sys.stdin.buffer)))
    except Exception:
        print('Release request rejected', file=sys.stderr)
        raise SystemExit(1)
