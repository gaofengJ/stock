#!/usr/bin/env python3
"""Send only small validated feed documents through the restricted CI SSH key."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess


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
                   '-o', 'ConnectTimeout=15', '-o', 'ServerAliveInterval=20',
                   'stock-deploy@14.103.103.4', 'news ' + args.mode + ' ' + source + ' ' + digest]
        receipt = json.loads(subprocess.check_output(command, input=raw, timeout=120))
        assert receipt['source'] == source and receipt['sha256'] == digest
        assert receipt['published'] == (args.mode == 'publish')
        print(json.dumps(receipt), flush=True)
        sent += 1
    assert sent > 0, 'No supported feed to send'


if __name__ == '__main__':
    main()
