#!/usr/bin/env python3
"""Send checksummed feed documents with the restricted CI key."""
import argparse
import base64
import hashlib
import http.client
import json
from pathlib import Path
import subprocess
import random
import ssl
import sys
import time
import urllib.error
import urllib.request


# Retry only transient transport errors, never credentials, host identity, or feed rejection.
TRANSIENT_ERRORS = ('connection timed out', 'connection reset', 'connection closed',
                    'connection refused', 'connection dropped', 'network is unreachable', 'no route to host',
                    'broken pipe', 'operation timed out')
PERMANENT_ERRORS = ('permission denied', 'host key verification failed',
                    'remote host identification has changed', 'invalid format',
                    'bad permissions', 'no such identity')


HTTPS_URL = 'https://stock.mufengtongxue.com/ops/news-delivery'
NAMESPACE = 'stock-news-delivery-v1'
RETRYABLE_HTTP = {408, 429, 500, 502, 503, 504}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class TransportUnavailable(RuntimeError):
    pass


def parse_receipt(raw, source, digest, mode):
    receipt = json.loads(raw)
    if (not isinstance(receipt, dict) or receipt.get('source') != source or
            receipt.get('sha256') != digest or receipt.get('published') is not (mode == 'publish')):
        raise ValueError('Delivery receipt does not match source, checksum or mode')
    return receipt


def deliver_https(key, raw, source, digest, mode):
    command = f'news {mode} {source} {digest}'
    signed = subprocess.run(
        ['ssh-keygen', '-Y', 'sign', '-f', str(key.resolve()), '-n', NAMESPACE],
        input=command.encode('ascii'), capture_output=True, check=True, timeout=5,
    ).stdout
    request = urllib.request.Request(HTTPS_URL, data=raw, headers={
        'Content-Type': 'application/json',
        'X-Stock-News-Command': command,
        'X-Stock-News-Signature': base64.b64encode(signed).decode('ascii'),
    })
    opener = urllib.request.build_opener(NoRedirect())
    for attempt in range(3):
        try:
            with opener.open(request, timeout=10) as response:
                result = response.read(4097)
                length = response.getheader('Content-Length')
                if length and length.isascii() and length.isdecimal() and len(result) != int(length):
                    raise http.client.IncompleteRead(result)
        except urllib.error.HTTPError as error:
            if error.code not in RETRYABLE_HTTP:
                raise ValueError(f'HTTPS delivery rejected (HTTP {error.code})') from None
            reason = f'HTTP {error.code}'
        except urllib.error.URLError as error:
            if isinstance(error.reason, ssl.SSLCertVerificationError):
                raise ValueError('HTTPS certificate verification failed') from None
            reason = type(error.reason).__name__
        except (OSError, http.client.HTTPException) as error:
            if isinstance(error, ssl.SSLCertVerificationError):
                raise ValueError('HTTPS certificate verification failed') from None
            reason = type(error).__name__
        else:
            if len(result) > 4096:
                raise ValueError('HTTPS delivery receipt exceeds size limit')
            return parse_receipt(result, source, digest, mode)
        if attempt == 2:
            raise TransportUnavailable(f'{source}: HTTPS delivery unavailable ({reason})')
        print(f'NEWS_HTTPS_RETRY source={source} attempt={attempt + 1}/3 reason={reason}',
              file=sys.stderr, flush=True)
        time.sleep(2 ** attempt)


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
            return parse_receipt(result.stdout, source, digest, mode)
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
    parser.add_argument('--transport', choices=('ssh', 'https', 'https-with-ssh'),
                        default='ssh')
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
        transport = args.transport
        if transport != 'ssh':
            try:
                receipt = deliver_https(args.key, raw, source, digest, args.mode)
                transport = 'https'
            except TransportUnavailable as error:
                if transport == 'https':
                    raise
                print(f'::warning::{error}. Retrying over restricted SSH.', flush=True)
                transport = 'ssh'
        if transport == 'ssh':
            receipt = deliver(command, raw, source, digest, args.mode)
        print(f'NEWS_DELIVERY_TRANSPORT source={source} transport={transport}', flush=True)
        print(json.dumps(receipt), flush=True)
        sent += 1
    assert sent > 0, 'No supported feed to send'


if __name__ == '__main__':
    main()
