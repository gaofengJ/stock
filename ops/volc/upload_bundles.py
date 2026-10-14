#!/usr/bin/env python3
"""Send CI archives through the upload-only SSH account; do not deploy them."""
import argparse
import hashlib
from pathlib import Path
import re
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument('directory', type=Path)
parser.add_argument('--key', required=True)
parser.add_argument('--known-hosts', required=True)
args = parser.parse_args()
count = 0
for folder in sorted(args.directory.iterdir()):
    if not folder.is_dir():
        continue
    archives = list(folder.glob('*.tar.zst'))
    if len(archives) != 1:
        raise ValueError('Expected exactly one image archive per artifact')
    archive = archives[0]
    role = {'frontend.tar.zst': 'front', 'backend.tar.zst': 'back',
            'content.tar.zst': 'content'}[archive.name]
    commit = (folder / 'commit').read_text().strip()
    if not re.fullmatch('[0-9a-f]{40}', commit):
        raise ValueError('Invalid artifact commit')
    checksum_files = list(folder.glob('*.sha256')) if role != 'content' else [folder / 'SHA256SUMS']
    if len(checksum_files) != 1:
        raise ValueError('Expected one archive checksum manifest')
    expected, checksum_name = checksum_files[0].read_text().strip().split(maxsplit=1)
    if Path(checksum_name).name != archive.name or not re.fullmatch('[0-9a-f]{64}', expected):
        raise ValueError('Invalid checksum manifest')
    digest = hashlib.sha256()
    with archive.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    if digest.hexdigest() != expected:
        raise ValueError('Artifact checksum mismatch')
    with archive.open('rb') as stream:
        subprocess.run(['ssh', '-i', args.key, '-o', 'IdentitiesOnly=yes',
                        '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes',
                        '-o', f'UserKnownHostsFile={args.known_hosts}',
                        '-o', 'ConnectTimeout=20', '-o', 'ServerAliveInterval=15',
                        '-o', 'ServerAliveCountMax=4', 'stock-deploy@14.103.103.4',
                        f'receive {role} {commit} {expected}'], stdin=stream, check=True)
    count += 1
if not count:
    raise ValueError('No artifacts found')
