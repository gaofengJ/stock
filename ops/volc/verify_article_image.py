#!/usr/bin/env python3
"""Compare every built image file against the original VitePress output."""
import argparse
import json
from pathlib import Path
import subprocess


def verify(image, manifest):
    expected = {entry['path']: entry['sha256'] for entry in manifest['manifest']}
    output = subprocess.check_output(['docker', 'run', '--rm', '--network', 'none', '--read-only',
                                     '--cap-drop', 'ALL', '--entrypoint', 'sh', '--workdir',
                                     '/usr/share/nginx/html', image, '-c',
                                     'find . -type f -exec sha256sum {} +'], text=True)
    actual = {}
    for line in output.splitlines():
        sha, separator, path = line.partition('  ./')
        if not separator or len(sha) != 64: raise ValueError('Unexpected image checksum output')
        actual[path] = sha
    assert actual == expected, 'Image file paths/content differ from the tested built site'
    print('Verified every article image file:', len(actual))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--image', required=True); parser.add_argument('--manifest', type=Path, required=True)
    args = parser.parse_args(); verify(args.image, json.loads(args.manifest.read_text()))
