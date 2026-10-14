#!/usr/bin/python3
"""Restricted SSH feed intake: bounded JSON, fixed sources, no shell or DB access."""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import tempfile

from bloomberg_relay import MAX_BYTES, validate_feed as validate_bloomberg
from sina_relay import validate_feed as validate_sina


def receive(command, stream, root=Path('/srv/stock/news'), enabled=Path('/etc/stock-news-delivery.enabled')):
    match = re.fullmatch(r'news (validate|publish) (bloomberg|sina) ([a-f0-9]{64})', command)
    if not match:
        raise ValueError('Only a checksummed supported news feed is allowed')
    mode, source, expected = match.groups()
    raw = stream.read(MAX_BYTES + 1)
    if not raw or len(raw) > MAX_BYTES or hashlib.sha256(raw).hexdigest() != expected:
        raise ValueError('Incomplete feed, invalid checksum or size limit exceeded')
    validator = validate_bloomberg if source == 'bloomberg' else validate_sina
    feed = validator(json.loads(raw))
    receipt = {'source': source, 'items': len(feed['items']), 'generatedAt': feed['generated_at'],
               'sha256': expected, 'published': False}
    if mode == 'validate':
        return receipt
    if not enabled.is_file():
        raise ValueError('Production news delivery has not been enabled')
    target = root / (source + '.json')
    with (root / '.delivery.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        if target.exists():
            previous = json.loads(target.read_text())
            if previous['generated_at'] > feed['generated_at']:
                raise ValueError('Refusing to replace a newer feed')
        temporary = None
        try:
            with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=root, prefix='.delivery-', delete=False) as output:
                temporary = Path(output.name)
                json.dump(feed, output, ensure_ascii=False)
                output.flush()
                os.fsync(output.fileno())
            # Public news content; readers still need access to the restricted parent directory.
            temporary.chmod(0o644)
            temporary.replace(target)
            receipt['published'] = True
        finally:
            if temporary and temporary.exists():
                temporary.unlink()
    return receipt


if __name__ == '__main__':
    try:
        os.umask(0o077)
        print(json.dumps(receive(os.environ.get('SSH_ORIGINAL_COMMAND', ''), sys.stdin.buffer)))
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
