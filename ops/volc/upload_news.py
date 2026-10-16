#!/usr/bin/env python3
"""Send only small validated feed documents through the restricted CI SSH key."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import random
import sys
import time


# Retry only transient transport errors, never credentials, host identity, or feed rejection.
TRANSIENT_ERRORS = ('connection timed out', 'connection reset', 'connection closed',
                    'connection refused', 'network is unreachable', 'no route to host',
                    'broken pipe', 'operation timed out')
PERMANENT_ERRORS = ('permission denied', 'host key verification failed',
                    'remote host identification has changed', 'invalid format',
                    'bad permissions', 'no such identity')


def deliver(command, raw, source, digest, mode):
    deadline = time.monotonic() + 90
    for attempt in range(1, 5):
        try:
            result = subprocess.run(command, input=raw, stdout=subprocess.PIPE,
                                    stderr=subprocess.PIPE, check=True,
                                    timeout=min(30, max(0.1, deadline - time.monotonic())))
        except subprocess.CalledProcessError as error:
            message = (error.stderr or b'').decode('utf-8', errors='replace').lower()
            transient = (error.returncode == 255 and
                         not any(value in message for value in PERMANENT_ERRORS) and
                         any(value in message for value in TRANSIENT_ERRORS))
            if not transient:
                raise RuntimeError(f'{source}: non-retryable SSH/receiver failure (exit {error.returncode})') from None
            reason = next(value for value in TRANSIENT_ERRORS if value in message)
        except subprocess.TimeoutExpired:
            # The receiver atomically replaces a checksummed feed. Replaying these same
            # bytes is safe even when the previous write succeeded but its receipt was lost.
            reason = 'delivery timeout'
        else:
            receipt = json.loads(result.stdout)
            if (receipt.get('source') != source or receipt.get('sha256') != digest or
                    receipt.get('published') is not (mode == 'publish')):
                raise ValueError('Delivery receipt does not match source, checksum or mode')
            return receipt
        delay = 2 ** attempt + random.uniform(0, 2)
        if attempt == 4 or time.monotonic() + delay >= deadline:
            raise RuntimeError(f'{source}: {reason}; bounded SSH retries exhausted') from None
        print(f'NEWS_DELIVERY_RETRY source={source} attempt={attempt}/4 '
              f'reason={reason} delay={delay:.1f}s', file=sys.stderr, flush=True)
        time.sleep(delay)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--key', type=Path, required=True)
    parser.add_argument('--known-hosts', type=Path, required=True)
    parser.add_argument('--mode', choices=('validate', 'publish'), default='validate')
    parser.add_argument('--directory', type=Path, required=True)
    args = parser.parse_args()
    sent = 0
    for source in ('bloomberg', 'sina'):
        path = args.directory / (source + '.json')
        if not path.is_file():
            continue
        assert 0 < path.stat().st_size <= 1024**2
        raw = path.read_bytes()
        digest = hashlib.sha256(raw).hexdigest()
        command = ['ssh', '-i', str(args.key.resolve()), '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes',
                   '-o', 'StrictHostKeyChecking=yes', '-o', 'UserKnownHostsFile=' + str(args.known_hosts.resolve()),
                   '-o', 'ConnectTimeout=15', '-o', 'ServerAliveInterval=10', '-o', 'ServerAliveCountMax=2',
                   'stock-deploy@14.103.103.4', 'news ' + args.mode + ' ' + source + ' ' + digest]
        receipt = deliver(command, raw, source, digest, args.mode)
        print(json.dumps(receipt), flush=True)
        sent += 1
    assert sent > 0, 'No supported feed to send'


if __name__ == '__main__':
    main()
