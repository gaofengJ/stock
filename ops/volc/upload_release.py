#!/usr/bin/env python3
"""Submit fixed image receipts to the restricted SSH receiver, never shell commands."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import time
from release_contract import validate_request, MAX_BYTES


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--key', type=Path, required=True)
    parser.add_argument('--known-hosts', type=Path, required=True)
    parser.add_argument('--receipt', type=Path, required=True)
    parser.add_argument('--run-id', type=int, required=True)
    parser.add_argument('--mode', choices=('validate', 'queue'), default='validate')
    args = parser.parse_args()
    request = {'commit': (args.receipt / 'commit').read_text().strip(), 'runId': args.run_id,
               'registryUsername': os.environ['REGISTRY_USER'], 'registryPassword': os.environ['REGISTRY_PASSWORD']}
    for role in ('back', 'front'):
        request[role + 'Digest'] = (args.receipt / (role + '-digest')).read_text().strip()
        request[role + 'ImageId'] = (args.receipt / (role + '-image-id')).read_text().strip()
    if any((args.receipt / ('article-' + field)).exists() for field in ('digest', 'image-id')):
        request['articleDigest'] = (args.receipt / 'article-digest').read_text().strip()
        request['articleImageId'] = (args.receipt / 'article-image-id').read_text().strip()
    raw = json.dumps(validate_request(request)).encode()
    if len(raw) > MAX_BYTES:
        raise ValueError('Request too large')
    base = ['ssh', '-i', str(args.key.resolve()), '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes',
            '-o', 'StrictHostKeyChecking=yes', '-o', 'UserKnownHostsFile=' + str(args.known_hosts.resolve()),
            '-o', 'ConnectTimeout=15', 'stock-deploy@14.103.103.4']
    result = json.loads(subprocess.check_output(base + ['release ' + args.mode + ' ' + hashlib.sha256(raw).hexdigest()],
                                               input=raw, timeout=60))
    print(json.dumps(result), flush=True)
    if args.mode == 'validate':
        assert result['state'] == 'validated-not-queued'
        return
    # Never resubmit after a transport failure; inspect by ID to avoid duplicate deployments.
    identity = result['id']
    for _ in range(120):
        time.sleep(15)
        result = json.loads(subprocess.check_output(base + ['release status ' + identity], timeout=45))
        if result['state'] != 'pending':
            print(json.dumps(result), flush=True)
            if result['state'] not in ('deployed', 'already-current') or result.get('opsCommit') != request['commit']:
                raise SystemExit(1)
            return
    raise TimeoutError('Release status deadline exceeded; inspect this ID without resubmitting')


if __name__ == '__main__':
    main()
