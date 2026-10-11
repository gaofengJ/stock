"""Narrow notebook upload limit; keep the existing API proxy and auth inheritance."""
import argparse
import os
import pathlib
import re
import subprocess
import tempfile

OLD_RULE = """
                    # Illustrated review uploads: inherit this API location's proxy and headers.
                    location = /api/review/notebook { client_max_body_size 8m; }
                    location = /api/review/notebook/ { client_max_body_size 8m; }
"""
# Old host nginx versions do not inherit the parent's proxy content handler.
# Retain inherited headers/auth but explicitly name the existing upstream.
RULE = OLD_RULE.replace('client_max_body_size 8m; }', 'client_max_body_size 8m; proxy_pass http://127.0.0.1:3000; }')


def masked(text):
    # Preserve offsets while ignoring comments and quoted braces/directives.
    return re.sub(r"#[^\n]*|\"(?:\\.|[^\"\\])*\"|'(?:\\.|[^'\\])*'", lambda m: ' ' * len(m.group()), text)


def end_block(text, start):
    depth = 0
    for i in range(start, len(text)):
        if text[i] == '{':
            depth += 1
        elif text[i] == '}':
            depth -= 1
            if depth == 0:
                return i
    raise ValueError('Unbalanced nginx configuration')


def render(text):
    structure = masked(text)
    candidates = []
    for server in re.finditer(r'\bserver\s*\{', structure):
        start = server.end() - 1
        end = end_block(structure, start)
        block = structure[start:end]
        if not re.search(r'\bserver_name\s+stock\.mufengtongxue\.com\s*;', block):
            continue
        for location in re.finditer(r'\blocation\s+/api\s*\{', block):
            candidates.append((start + location.end(), start, end))
    if len(candidates) != 1:
        raise ValueError('Expected exactly one existing stock /api proxy; refusing a broad change')
    insert, server_start, server_end = candidates[0]
    block = text[server_start:server_end]
    if RULE in block:
        return text
    api_end = end_block(structure, insert - 1)
    if not re.search(r'\bproxy_pass\s+http://127\.0\.0\.1:3000\s*;', structure[insert:api_end]):
        raise ValueError('Unexpected API upstream; refusing to reroute notebook saves')
    if OLD_RULE in block:
        return text[:server_start] + block.replace(OLD_RULE, RULE, 1) + text[server_end:]
    if re.search(r'\blocation[^\n{]*/api/review/notebook', structure[server_start:server_end]):
        raise ValueError('An existing notebook location needs manual review')
    return text[:insert] + RULE + text[insert:]


def atomic_write(path, data, stat):
    descriptor, temporary = tempfile.mkstemp(prefix='.review-proxy-', dir=str(path.parent))
    try:
        with os.fdopen(descriptor, 'wb') as stream:
            stream.write(data)
        os.chmod(temporary, stat.st_mode & 0o777)
        if hasattr(os, 'chown'):
            os.chown(temporary, stat.st_uid, stat.st_gid)
        os.replace(temporary, str(path))
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def apply(config, backup):
    path = pathlib.Path(config)
    if path.is_symlink() or not path.is_file():
        raise ValueError('Expected a regular nginx configuration file')
    before = path.read_bytes()
    after = render(before.decode('utf-8')).encode('utf-8')
    if after == before:
        print('Notebook proxy limit already configured')
        return
    subprocess.check_call(['nginx', '-t'])
    with pathlib.Path(backup).open('xb') as stream:
        stream.write(before)
    stat = path.stat()
    try:
        atomic_write(path, after, stat)
        subprocess.check_call(['nginx', '-t'])
        subprocess.check_call(['nginx', '-s', 'reload'])
    except Exception:
        atomic_write(path, before, stat)
        subprocess.check_call(['nginx', '-t'])
        subprocess.check_call(['nginx', '-s', 'reload'])
        raise
    print('Configured 8 MiB only for the two notebook save paths; existing proxy inheritance preserved')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', default='/etc/nginx/nginx.conf')
    parser.add_argument('--backup')
    parser.add_argument('--output')
    args = parser.parse_args()
    if args.output:
        pathlib.Path(args.output).write_text(render(pathlib.Path(args.config).read_text()))
    elif args.backup:
        apply(args.config, args.backup)
    else:
        parser.error('Specify --output for validation or --backup to apply')
