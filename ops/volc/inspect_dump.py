#!/usr/bin/env python3
"""Read a mysqldump backup; verify its recorded hash and count source snapshot rows.

Only supports the single-line INSERT format produced by the stock backup job.
Never logs data values and never connects to a database.
"""
import argparse
import gzip
import hashlib
import json
import re
from pathlib import Path

CREATE = re.compile(rb'^CREATE TABLE `([^`]+)`')
INSERT = re.compile(rb'^INSERT INTO `([^`]+)` VALUES (.*);\r?\n?$', re.DOTALL)
TOKEN = re.compile(rb"'(?:[^'\\]|\\.|'')*'|[()]")


def count_values(values):
    depth = 0
    count = 0
    for match in TOKEN.finditer(values):
        token = match[0]
        if token == b'(':
            if depth == 0:
                count += 1
            depth += 1
        elif token == b')':
            depth -= 1
            if depth < 0:
                raise ValueError('Unbalanced INSERT values')
    if depth or not count:
        raise ValueError('Unsupported INSERT values')
    return count


def inspect(archive, metadata):
    digest = hashlib.sha256()
    with archive.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    if archive.stat().st_size != metadata['bytes'] or digest.hexdigest() != metadata['sha256']:
        raise ValueError('Backup size or SHA256 does not match source metadata')
    rows = {}
    # Raw SQL preserves rsync block matching for the final, bandwidth-limited sync.
    opener = gzip.open if archive.suffix == '.gz' else open
    with opener(archive, 'rb') as stream:
        for line in stream:
            table = CREATE.match(line)
            if table:
                rows.setdefault(table[1].decode('utf-8'), 0)
            if line.startswith(b'INSERT '):
                insert = INSERT.fullmatch(line)
                if not insert:
                    raise ValueError('Unsupported INSERT format; do not trust partial counts')
                name = insert[1].decode('utf-8')
                if name not in rows:
                    raise ValueError('INSERT without CREATE TABLE')
                rows[name] += count_values(insert[2])
    if not rows:
        raise ValueError('No tables in backup')
    return {'sourceCompletedAt': metadata['completedAt'], 'sha256': digest.hexdigest(),
            'tableCount': len(rows), 'rows': dict(sorted(rows.items()))}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('archive', type=Path)
    parser.add_argument('metadata', type=Path)
    args = parser.parse_args()
    print(json.dumps(inspect(args.archive, json.loads(args.metadata.read_text())), indent=2))
