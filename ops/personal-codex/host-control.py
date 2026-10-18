#!/usr/bin/python3
"""Root-only lifecycle; credentials stay on the server, never stdout or arguments."""
import json, os, pathlib, subprocess, sys, hashlib
os.umask(0o077)
ROOT=pathlib.Path('/opt/stock-personal-console')
HOME=pathlib.Path('/run/stock-codex/home')
AUTH=HOME/'.codex/auth.json'
SEALED=pathlib.Path('/etc/stock-codex/auth.cred')
def run(args, **kw):
    p=subprocess.run(args,capture_output=True,timeout=kw.pop('timeout',30),**kw)
    if p.returncode: raise RuntimeError('operation_failed')
    return p
def checkpoint():
    if not AUTH.exists(): return
    raw=AUTH.read_bytes(); value=json.loads(raw)
    if value.get('auth_mode')!='chatgpt' or value.get('OPENAI_API_KEY'): raise RuntimeError('subscription_credentials_required')
    # The existing owner binding is checked again by the metadata client before every model task.
    dest=SEALED.with_suffix('.console-new')
    run(['systemd-creds','encrypt','--name=stock-codex-auth','--with-key=host','-',str(dest)],input=raw)
    dest.chmod(0o600);os.replace(dest,SEALED)
    (ROOT/'checkpoint-status.json').write_text(json.dumps({'encrypted':True}))
def prepare():
    # Restore the established credential/proxy mounts, without asking a model to run.
    p=run(['/usr/local/sbin/stock-codex-account','inspect'],timeout=180)
    state=json.loads(p.stdout.decode().strip().splitlines()[-1])
    if state.get('status')!='verified' or state.get('authType')!='chatgpt':raise RuntimeError('subscription_not_ready')
    checkpoint()
if __name__=='__main__':
    try:
        if os.geteuid()!=0:raise RuntimeError('root_required')
        action=sys.argv[1] if len(sys.argv)==2 else ''
        if action=='prepare':prepare()
        elif action=='checkpoint':checkpoint()
        elif action=='stop':
            run(['docker','stop','--time','5','stock-personal-console']);checkpoint()
        else:raise RuntimeError('unknown_action')
    except Exception as e:
        print(json.dumps({'ok':False,'errorType':type(e).__name__}));sys.exit(1)
