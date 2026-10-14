#!/usr/bin/python3
"""Forced SSH command: accept a checked image archive, never execute deployment."""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sys

MAX_BYTES = 2 * 1024**3
RESERVE_BYTES = 8 * 1024**3
ROOT = Path('/srv/stock/incoming')


def receive(command, stream, root=ROOT):
    match = re.fullmatch(r'receive (front|back|content) ([0-9a-f]{40}) ([0-9a-f]{64})', command)
    if not match:
        raise ValueError('Only a checksummed image upload is allowed')
    role, commit, expected = match.groups()
    root.mkdir(mode=0o700, exist_ok=True)
    if shutil.disk_usage(root).free < RESERVE_BYTES:
        raise ValueError('Insufficient free space for upload')
    target = root / f'{role}-{commit}-{expected[:16]}.tar.zst'
    part = target.with_suffix('.part')
    # An exclusive temporary file prevents overlapping uploads from replacing one another.
    digest = hashlib.sha256()
    total = 0
    try:
        with part.open('xb') as output:
            os.chmod(part, 0o600)
            while block := stream.read(1024 * 1024):
                total += len(block)
                if total > MAX_BYTES or shutil.disk_usage(root).free < RESERVE_BYTES:
                    raise ValueError('Upload exceeds space limit')
                digest.update(block)
                output.write(block)
            output.flush()
            os.fsync(output.fileno())
        if not total or digest.hexdigest() != expected:
            raise ValueError('Incomplete upload or SHA256 mismatch')
        os.replace(part, target)
        receipt = {'role': role, 'commit': commit, 'sha256': expected,
                   'bytes': total, 'file': target.name, 'state': 'uploaded-not-deployed'}
        receipt_path = target.with_suffix('.json')
        receipt_path.write_text(json.dumps(receipt) + '\n')
        os.chmod(receipt_path, 0o600)
        return receipt
    except FileExistsError:
        raise ValueError('An upload for this archive is already in progress') from None
    except BaseException:
        part.unlink(missing_ok=True)
        raise


if __name__ == '__main__':
    try:
        os.umask(0o077)
        print(json.dumps(receive(os.environ.get('SSH_ORIGINAL_COMMAND', ''), sys.stdin.buffer)))
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
