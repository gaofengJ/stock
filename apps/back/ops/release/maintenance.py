"""Private backup verification and narrowly scoped release retention.

No global Docker prune and no deletion of unarchived database backups.
Invoke under the stock-back-release lock. Default invocation is read-only.
"""
import argparse
import datetime
import gzip
import hashlib
import json
import os
import pathlib
import re
import shutil
import subprocess
import sys
import time

REPOSITORY = 'registry.cn-hangzhou.aliyuncs.com/mufengtongxue/stock-back'
PREVIOUS = re.compile(r'^stock-back-previous-([a-f0-9]{12})-\d+$')
FAILED = re.compile(r'^stock-back-failed-[a-f0-9]{12}-\d+$')
BACKEND_TAG = re.compile(r'^' + re.escape(REPOSITORY) + r':[a-f0-9]{40}$')
ROLLBACK_TAG = re.compile(r'^stock-back-rollback:[a-f0-9]{12}$')
SHA = re.compile(r'^[a-f0-9]{64}$')
DAY = 86400


def timestamp(value):
    # Normalize Docker nanoseconds for the production host's older Python.
    value = re.sub(r'(\.\d{6})\d+', r'\1', value)
    value = value.replace('Z', '+0000')
    value = re.sub(r'([+-]\d{2}):(\d{2})$', r'\1\2', value)
    pattern = '%Y-%m-%dT%H:%M:%S.%f%z' if '.' in value else '%Y-%m-%dT%H:%M:%S%z'
    return datetime.datetime.strptime(value, pattern).timestamp()


def digest(path):
    result = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            result.update(block)
    return result.hexdigest()


def verified_backup(directory):
    archive = directory / 'stock.sql.gz'
    checksum = directory / 'stock.sql.gz.sha256'
    if archive.is_symlink() or checksum.is_symlink():
        raise ValueError('Symlinked backup rejected')
    expected = checksum.read_text().split()[0]
    if not SHA.fullmatch(expected) or digest(archive) != expected:
        raise ValueError('Backup checksum mismatch')
    with gzip.open(str(archive), 'rb') as stream:
        while stream.read(1024 * 1024):
            pass
    return expected


def backup_directories(root):
    result = []
    for parent in ('backups', 'runs'):
        base = root / parent
        if not base.exists() or base.is_symlink():
            continue
        for directory in base.iterdir():
            if directory.is_symlink() or not directory.is_dir():
                continue
            archive = directory / 'stock.sql.gz'
            if archive.is_symlink() or not archive.is_file():
                continue
            completed = directory / 'backup.json'
            phase = directory / 'phase'
            # Failed/interrupted migration backups remain recovery evidence.
            if parent == 'runs' and (not phase.is_file() or phase.read_text().strip() != 'success'):
                continue
            if parent == 'backups' and (completed.is_symlink() or not completed.is_file()):
                continue
            result.append(directory)
    return sorted(result, key=lambda item: (item/'stock.sql.gz').stat().st_mtime, reverse=True)


def recent_backup(root, preflight, now=None):
    now = time.time() if now is None else now
    for directory in backup_directories(root):
        manifest = directory / 'backup.json'
        if not manifest.is_file() or manifest.is_symlink():
            continue
        try:
            record = json.loads(manifest.read_text())
            age = now - timestamp(record['completedAt'])
            if record.get('version') != 1 or record.get('database') != 'stock' or not 0 <= age <= 36 * 3600:
                continue
            if sorted(record.get('migrationHistory', [])) != sorted(preflight['migrationHistory']):
                continue
            expected = verified_backup(directory)
            if record.get('sha256') != expected or record.get('bytes') != (directory/'stock.sql.gz').stat().st_size:
                continue
            return {'status': 'verified', 'directory': str(directory), 'ageHours': round(age/3600, 2), 'sha256': expected}
        except (OSError, ValueError, KeyError, EOFError):
            continue
    raise ValueError('No verified backup of the current schema within 36 hours')


def backup_candidates(root, now=None):
    now = time.time() if now is None else now
    # Keep at least three newest snapshots AND all snapshots younger than a week.
    return [item for item in backup_directories(root)[3:]
            if now - (item/'stock.sql.gz').stat().st_mtime >= 7 * DAY]


def archive_and_remove(directory, archive_root, root):
    # Archiving on the same filesystem would not free system-disk capacity.
    if not archive_root.is_dir():
        raise ValueError('Archive directory does not exist')
    archive_root = archive_root.resolve()
    if not archive_root.is_dir() or archive_root.stat().st_dev == root.stat().st_dev:
        raise ValueError('Archive must be an existing private directory on a separate filesystem')
    if os.path.commonpath([str(root.resolve()), str(archive_root)]) == str(root.resolve()):
        raise ValueError('Archive cannot be inside release storage')
    expected = verified_backup(directory)
    target = archive_root / directory.name
    if target.is_symlink():
        raise ValueError('Symlinked archive destination rejected')
    target.mkdir(mode=0o700, exist_ok=True)
    names = ['stock.sql.gz', 'backup.json', 'schema.json',
             'preflight.json', 'migration.jsonl', 'verification.json', 'phase',
             'old-container.json', 'old-container-name', 'old-image-id', 'timings.log']
    for name in names:
        source, destination = directory/name, target/name
        if not source.is_file():
            continue
        if source.is_symlink() or destination.is_symlink():
            raise ValueError('Symlinked archive metadata rejected')
        if destination.exists():
            if digest(source) != digest(destination):
                raise ValueError('Archive collision; existing copy is preserved')
            continue
        temporary = target / (name + '.partial')
        # Never overwrite a prior interrupted archive or follow a symlink.
        with temporary.open('xb') as output, source.open('rb') as incoming:
            os.chmod(str(temporary), 0o600)
            shutil.copyfileobj(incoming, output, 1024 * 1024)
            output.flush()
            os.fsync(output.fileno())
        temporary.replace(destination)
    checksum = target/'stock.sql.gz.sha256'
    if checksum.is_symlink():
        raise ValueError('Symlinked archive checksum rejected')
    if checksum.exists():
        if checksum.read_text().split()[0] != expected:
            raise ValueError('Archive checksum collision')
    else:
        with checksum.open('x') as stream:
            os.chmod(str(checksum), 0o600)
            stream.write(expected+'  stock.sql.gz\n')
            stream.flush()
            os.fsync(stream.fileno())
    if verified_backup(target) != expected:
        raise ValueError('Archived backup verification failed')
    if (directory/'archive.json').is_symlink():
        raise ValueError('Symlinked archive record rejected')
    (directory/'archive.json').write_text(json.dumps({'directory': str(target), 'sha256': expected}))
    # Only the verified local compressed copy is removed; all recovery metadata stays.
    (directory/'stock.sql.gz').unlink()


def docker_plan(containers, images, failed_prefixes, now=None):
    now = time.time() if now is None else now
    previous = sorted([item for item in containers if PREVIOUS.fullmatch(item['Name'].lstrip('/'))],
                      key=lambda item: timestamp(item['Created']), reverse=True)
    newest = {item['Id'] for item in previous[:3]}
    remove, protected_images = [], set()
    for item in containers:
        match = PREVIOUS.fullmatch(item['Name'].lstrip('/'))
        eligible = (match and item['Id'] not in newest and not item['State']['Running']
                    and now-timestamp(item['Created']) >= 7*DAY and match.group(1) not in failed_prefixes)
        if eligible:
            remove.append(item['Id'])
        else:
            # Every running or unrelated container protects its image.
            protected_images.add(item['Image'])
    tags = []
    for image in images:
        if image['Id'] in protected_images or now-timestamp(image['Created']) < 7*DAY:
            continue
        for tag in image.get('RepoTags') or []:
            if BACKEND_TAG.fullmatch(tag) or ROLLBACK_TAG.fullmatch(tag):
                suffix = tag.split(':')[-1][:12]
                if suffix not in failed_prefixes:
                    tags.append(tag)
    return {'containers': remove, 'imageTags': sorted(set(tags))}


def docker_json(kind):
    ids = subprocess.check_output(['docker', kind, 'ls', '-aq'], universal_newlines=True).split()
    if not ids:
        return []
    return json.loads(subprocess.check_output(['docker', kind, 'inspect'] + sorted(set(ids)), universal_newlines=True))


def maintenance(root, apply=False):
    if not root.is_dir():
        raise ValueError('Release directory does not exist')
    root = root.resolve()
    policy_file = root/'policy.json'
    policy = json.loads(policy_file.read_text()) if policy_file.is_file() else {}
    archive_root = pathlib.Path(policy['archiveRoot']) if policy.get('archiveRoot') else None
    failed = set()
    runs = root/'runs'
    if runs.is_dir() and not runs.is_symlink():
        for directory in runs.iterdir():
            suffix = directory.name.rsplit('-', 1)[-1]
            phase = directory/'phase'
            if re.fullmatch('[a-f0-9]{40}', suffix) and (directory.is_symlink() or not phase.is_file() or phase.read_text().strip() != 'success'):
                failed.add(suffix[:12])
    plan = docker_plan(docker_json('container'), docker_json('image'), failed)
    candidates = backup_candidates(root)
    result = dict(plan, backupCandidates=len(candidates), archivedBackups=0,
                  backupCleanup='archive-required' if not archive_root else 'configured', applied=apply)
    if apply:
        for directory in candidates:
            if archive_root:
                archive_and_remove(directory, archive_root, root)
                result['archivedBackups'] += 1
        for container in plan['containers']:
            subprocess.check_call(['docker', 'container', 'rm', container])
        for tag in plan['imageTags']:
            subprocess.check_call(['docker', 'image', 'rm', tag])
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', default='/opt/stock-release')
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--check-backup', metavar='PREFLIGHT_JSON')
    args = parser.parse_args()
    root = pathlib.Path(args.root)
    if args.check_backup:
        result = recent_backup(root, json.loads(pathlib.Path(args.check_backup).read_text()))
    else:
        result = maintenance(root, args.apply)
    print(json.dumps(result))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, KeyError, subprocess.CalledProcessError) as error:
        print(json.dumps({'status': 'deferred', 'error': str(error)}), file=sys.stderr)
        sys.exit(1)
