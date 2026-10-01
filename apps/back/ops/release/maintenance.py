"""Private backup verification and narrowly scoped release retention.

No global Docker prune. Local backups retain the current schema plus two extras.
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
FRONT_REPOSITORY = 'registry.cn-hangzhou.aliyuncs.com/mufengtongxue/stock-front'
PREVIOUS = re.compile(r'^stock-(back|front)-previous-([a-f0-9]{12})-\d+$')
FAILED = re.compile(r'^stock-(back|front)-failed-[a-f0-9]{12}-\d+$')
RELEASE_TAG = re.compile(r'^(' + re.escape(REPOSITORY) + '|' + re.escape(FRONT_REPOSITORY) + r'):(?:[a-f0-9]{40}|ci-[a-f0-9]{40}|latest)$')
ROLLBACK_TAG = re.compile(r'^stock-(back|front)-rollback:[a-f0-9]{12}$')
PRESERVED_TAG = re.compile(r'^stock-runtime-preserved:[a-z0-9_.-]+-[a-f0-9]{12}$')
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


def local_backup_plan(root, preflight, now=None):
    """Validate all retained recovery points before allowing any deletion."""
    root = root.resolve()
    if preflight.get('database') != 'stock':
        raise ValueError('Unexpected live database')
    directories = backup_directories(root)
    current = pathlib.Path(recent_backup(root, preflight, now)['directory'])
    retained = [current] + [item for item in directories if item != current][:2]
    # A damaged history backup must not cause deletion of a healthy older copy.
    for directory in retained:
        if directory != current:
            verified_backup(directory)
    candidates = [item for item in directories if item not in retained]
    for directory in retained + candidates:
        if directory.parent not in (root/'backups', root/'runs') or directory.resolve() != directory:
            raise ValueError('Backup path escapes release storage')
        for name in ('stock.sql.gz', 'stock.sql.gz.sha256', 'cleanup.json'):
            if (directory/name).is_symlink():
                raise ValueError('Symlinked backup cleanup rejected')
    return dict(current=current, retained=retained, candidates=candidates)


def remove_local_backup(directory):
    archive = directory/'stock.sql.gz'
    size = archive.stat().st_size
    # Keep manifests, migration reports, logs and runtime configuration intact.
    (directory/'cleanup.json').write_text(json.dumps(dict(
        policy='current-schema-plus-two', bytes=size,
        removedAt=datetime.datetime.now(datetime.timezone.utc).isoformat())))
    archive.unlink()
    checksum = directory/'stock.sql.gz.sha256'
    if checksum.is_file():
        checksum.unlink()
    return size


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


def image_ancestors(images, roots):
    by_id = {item['Id']: item for item in images}
    result, pending = set(roots), list(roots)
    while pending:
        parent = by_id.get(pending.pop(), {}).get('Parent')
        if parent and parent not in result:
            result.add(parent)
            pending.append(parent)
    return result


def docker_plan(containers, images, successful_previous=None, now=None):
    # Keep exactly current + one distinct successful prior image per application.
    # Unrelated containers, including stopped ones, always protect their images.
    keep, managed = set(), set()
    retained = []
    for service in ('back', 'front'):
        current = [item for item in containers if item['Name'].lstrip('/') == 'stock-'+service]
        if not current or not current[0]['State']['Running']:
            # A stopped current service can be a failed DDL release; never clean
            # its recovery resources while production is in maintenance state.
            continue
        current = current[0]
        keep.add(current['Id'])
        retained.append({'service': service, 'role': 'current', 'container': current['Name'], 'image': current['Image']})
        previous = []
        for item in containers:
            name = item['Name'].lstrip('/')
            match = PREVIOUS.fullmatch(name)
            if match and match.group(1) == service:
                if successful_previous is None or name in successful_previous:
                    previous.append(item)
                managed.add(item['Id'])
            failed = FAILED.fullmatch(name)
            if failed and failed.group(1) == service:
                managed.add(item['Id'])
        previous.sort(key=lambda item: timestamp(item['Created']), reverse=True)
        prior = next((item for item in previous if item['Image'] != current['Image']), None)
        if prior:
            keep.add(prior['Id'])
            retained.append({'service': service, 'role': 'previous', 'container': prior['Name'], 'image': prior['Image']})
    remove, protected_images = [], set()
    for item in containers:
        eligible = item['Id'] in managed and item['Id'] not in keep and not item['State']['Running']
        if eligible:
            remove.append(item['Id'])
        else:
            # Every running or unrelated container protects its image.
            protected_images.add(item['Image'])
    # Classic Docker builds expose parent images. A required parent is not
    # obsolete merely because it has no tag or direct container reference.
    unmanaged_images = {item['Id'] for item in images if any(not (RELEASE_TAG.fullmatch(tag) or ROLLBACK_TAG.fullmatch(tag) or PRESERVED_TAG.fullmatch(tag)) for tag in item.get('RepoTags') or [])}
    protected_images = image_ancestors(images, protected_images | unmanaged_images)
    tags, dangling, runtime_tags = [], [], []
    # A missing/stopped application's image family is protected as a whole.
    active = {item['Name'].lstrip('/') for item in containers if item['State']['Running']}
    for image in images:
        if image['Id'] in protected_images:
            if not image.get('RepoTags'):
                owners = [item for item in containers if item['Image'] == image['Id'] and item['State']['Running']]
                if owners:
                    name = re.sub(r'[^a-z0-9_.-]', '-', owners[0]['Name'].lstrip('/').lower())
                    runtime_tags.append({'image': image['Id'], 'tag': 'stock-runtime-preserved:'+name+'-'+image['Id'].split(':')[-1][:12]})
                else:
                    runtime_tags.append({'image': image['Id'], 'tag': 'stock-runtime-preserved:dependency-'+image['Id'].split(':')[-1][:12]})
            continue
        image_tags = image.get('RepoTags') or []
        if not image_tags:
            dangling.append(image['Id'])
        for tag in image_tags:
            service = 'front' if tag.startswith(FRONT_REPOSITORY+':') or tag.startswith('stock-front-rollback:') else 'back'
            if PRESERVED_TAG.fullmatch(tag) or ('stock-'+service in active and (RELEASE_TAG.fullmatch(tag) or ROLLBACK_TAG.fullmatch(tag))):
                tags.append(tag)
    return {'containers': remove, 'imageTags': sorted(set(tags)), 'danglingImages': sorted(set(dangling)), 'retained': retained, 'runtimeImageTags': runtime_tags}


def docker_json(kind):
    ids = subprocess.check_output(['docker', kind, 'ls', '-aq'], universal_newlines=True).split()
    if not ids:
        return []
    return json.loads(subprocess.check_output(['docker', kind, 'inspect'] + sorted(set(ids)), universal_newlines=True))


def maintenance(root, apply=False, images_only=False, backups_only=False):
    if not root.is_dir():
        raise ValueError('Release directory does not exist')
    root = root.resolve()
    policy_file = root/'policy.json'
    if policy_file.is_symlink():
        raise ValueError('Symlinked retention policy rejected')
    policy = json.loads(policy_file.read_text()) if policy_file.is_file() else {}
    archive_root = pathlib.Path(policy['archiveRoot']) if policy.get('archiveRoot') else None
    backup_mode = policy.get('backupMode', 'local-count')
    if backup_mode not in ('local-count', 'archive'):
        raise ValueError('Unsupported backup retention policy')
    successful_previous = set()
    for folder in ('runs', 'front-runs'):
        runs = root/folder
        if runs.is_dir() and not runs.is_symlink():
            for directory in runs.iterdir():
                phase, old = directory/'phase', directory/'old-container-name'
                if directory.is_symlink() or phase.is_symlink() or old.is_symlink():
                    continue
                if phase.is_file() and phase.read_text().strip() == 'success' and old.is_file():
                    name = old.read_text().strip()
                    if PREVIOUS.fullmatch(name):
                        successful_previous.add(name)
    plan = dict(containers=[], imageTags=[], danglingImages=[], retained=[], runtimeImageTags=[])
    if not backups_only:
        plan = docker_plan(docker_json('container'), docker_json('image'), successful_previous)
    local = None
    if images_only:
        candidates = []
    elif backup_mode == 'local-count':
        if backup_directories(root):
            # Read the actual running database, rather than guessing from the
            # newest release directory (which could describe a failed release).
            preflight = json.loads(subprocess.check_output([
                'docker', 'exec', 'stock-back', 'node',
                'ops/release/database.cjs', 'backup-info'], universal_newlines=True))
            local = local_backup_plan(root, preflight)
        candidates = local['candidates'] if local else []
    else:
        candidates = backup_candidates(root)
    result = dict(plan, backupCandidates=len(candidates), archivedBackups=0,
                  backupCleanup='skipped' if images_only else (backup_mode if backup_mode == 'local-count' else ('archive-required' if not archive_root else 'configured')),
                  backupRetained=[dict(directory=str(item), role='current' if item == local['current'] else 'extra',
                      bytes=(item/'stock.sql.gz').stat().st_size) for item in local['retained']] if local else [],
                  backupRemoved=[], backupFreedBytes=0, applied=apply)
    if apply:
        # A running service may have lost its original tag during a previous
        # deploy. Give it an explicit local tag instead of interrupting it.
        for record in plan['runtimeImageTags']:
            subprocess.check_call(['docker', 'image', 'tag', record['image'], record['tag']])
        for directory in candidates:
            if backup_mode == 'local-count':
                result['backupFreedBytes'] += remove_local_backup(directory)
                result['backupRemoved'].append(str(directory))
            elif archive_root:
                archive_and_remove(directory, archive_root, root)
                result['archivedBackups'] += 1
        if backups_only:
            return result
        for container in plan['containers']:
            subprocess.check_call(['docker', 'container', 'rm', container])
        for tag in plan['imageTags']:
            subprocess.check_call(['docker', 'image', 'rm', tag])
        # Re-inspect after container/tag removal. Do not force-remove an image
        # that another service started using since the plan was computed.
        images = docker_json('image')
        references = {item['Image'] for item in docker_json('container')}
        required = image_ancestors(images, references | {item['Id'] for item in images if item.get('RepoTags')})
        pending = {item['Id']: item for item in images if not item.get('RepoTags') and item['Id'] not in required}
        # Remove unreferenced children before their unreferenced parent layers.
        while pending:
            parents = {item.get('Parent') for item in pending.values()}
            leaves = sorted(set(pending)-parents)
            if not leaves:
                raise ValueError('Unexpected Docker parent-image cycle')
            for identity in leaves:
                subprocess.check_call(['docker', 'image', 'rm', identity])
                del pending[identity]
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', default='/opt/stock-release')
    parser.add_argument('--apply', action='store_true')
    scope = parser.add_mutually_exclusive_group()
    scope.add_argument('--images-only', action='store_true')
    scope.add_argument('--backups-only', action='store_true')
    parser.add_argument('--check-backup', metavar='PREFLIGHT_JSON')
    args = parser.parse_args()
    root = pathlib.Path(args.root)
    if args.check_backup:
        result = recent_backup(root, json.loads(pathlib.Path(args.check_backup).read_text()))
    else:
        result = maintenance(root, args.apply, args.images_only, args.backups_only)
    print(json.dumps(result))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, KeyError, subprocess.CalledProcessError) as error:
        print(json.dumps({'status': 'deferred', 'error': str(error)}), file=sys.stderr)
        sys.exit(1)
