#!/usr/bin/env python3
"""Install an operator key, then harden SSH only after independent login verification.

Run `install-key` with one public key on stdin. From a NEW connection verify
`ssh -i <private-key> stock-admin@<host> sudo -n true`, then run `restrict`.
Existing sessions remain open. Root's console password is not changed.
"""
import argparse
import datetime
import os
from pathlib import Path
import pwd
import re
import shutil
import subprocess
import sys

ACCOUNT = 'stock-admin'
CONFIG = Path('/etc/ssh/sshd_config.d/00-stock-admin-key.conf')


def run(*args):
    return subprocess.check_output(args, text=True).strip()


def install_key(key):
    if not re.fullmatch(r'ssh-ed25519 [A-Za-z0-9+/=]+(?: [\w@.-]+)?', key):
        raise ValueError('One Ed25519 public key is required')
    try:
        user = pwd.getpwnam(ACCOUNT)
    except KeyError:
        run('useradd', '--create-home', '--shell', '/bin/bash', ACCOUNT)
        user = pwd.getpwnam(ACCOUNT)
    folder = Path(user.pw_dir) / '.ssh'
    folder.mkdir(mode=0o700, exist_ok=True)
    folder.chmod(0o700)
    os.chown(folder, user.pw_uid, user.pw_gid)
    target = folder / 'authorized_keys'
    existing = target.read_text() if target.exists() else ''
    if key not in existing:
        target.write_text(existing.rstrip() + '\nno-agent-forwarding,no-X11-forwarding ' + key + '\n')
    target.chmod(0o600)
    os.chown(target, user.pw_uid, user.pw_gid)
    sudo = Path('/etc/sudoers.d/stock-admin')
    content = f'{ACCOUNT} ALL=(ALL:ALL) NOPASSWD: ALL\n'
    if sudo.exists() and sudo.read_text() != content:
        raise ValueError('Existing operator sudo policy differs; preserve it')
    sudo.write_text(content)
    sudo.chmod(0o440)
    run('visudo', '-cf', str(sudo))
    print('Operator key installed. Verify a new connection and sudo before restrict.')


def restrict():
    if os.environ.get('SUDO_USER') != ACCOUNT or not os.environ.get('SSH_CONNECTION'):
        raise ValueError('Run restrict through a verified stock-admin SSH connection using sudo -E')
    backup = Path('/root/stock-ssh-recovery') / datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    backup.mkdir(parents=True, mode=0o700)
    previous = CONFIG.read_bytes() if CONFIG.exists() else None
    if previous is not None:
        (backup / CONFIG.name).write_bytes(previous)
    (backup / 'sshd-effective-before.txt').write_text(run('/usr/sbin/sshd', '-T'))
    CONFIG.write_text('PermitRootLogin no\nPasswordAuthentication no\nKbdInteractiveAuthentication no\nPubkeyAuthentication yes\n')
    CONFIG.chmod(0o644)
    try:
        run('/usr/sbin/sshd', '-t')
        config = run('/usr/sbin/sshd', '-T')
        for expected in ['permitrootlogin no', 'passwordauthentication no', 'kbdinteractiveauthentication no', 'pubkeyauthentication yes']:
            if expected not in config.splitlines():
                raise ValueError('SSH settings did not resolve to the intended policy')
        run('systemctl', 'reload', 'ssh')
    except Exception:
        if previous is None:
            CONFIG.unlink(missing_ok=True)
        else:
            CONFIG.write_bytes(previous)
        run('/usr/sbin/sshd', '-t')
        raise
    (backup / 'RESTORE.txt').write_text('Use a retained root session or cloud console. Restore the prior 00-stock-admin-key.conf if present, otherwise remove that file. Run sshd -t before systemctl reload ssh.\n')
    print('SSH key policy applied; recovery record: ' + str(backup))


if __name__ == '__main__':
    if os.geteuid() != 0:
        raise SystemExit('Root privileges are required')
    parser = argparse.ArgumentParser()
    parser.add_argument('mode', choices=['install-key', 'restrict'])
    args = parser.parse_args()
    install_key(sys.stdin.read().strip()) if args.mode == 'install-key' else restrict()
