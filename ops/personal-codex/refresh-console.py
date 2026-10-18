#!/usr/bin/python3
"""Replace only the isolated console; preserve image, mounts and a rollback container."""
import json,pathlib,subprocess
from importlib.util import spec_from_file_location,module_from_spec
spec=spec_from_file_location('admin_release',str(pathlib.Path(__file__).with_name('update-admin-entry.py')))
d=module_from_spec(spec);spec.loader.exec_module(d)
def main():
    tasks=pathlib.Path('/srv/stock-personal-console/tasks.json')
    initial=tasks.read_bytes() if tasks.exists() else b'[]'
    if any(t['status'] in ['running','preparing','cancelling'] for t in json.loads(initial)):raise RuntimeError('active_task_preserved')
    before=d.snapshot();image='stock-personal-console:admin-entry-3';backup=d.CONSOLE+'-before-read-cache'
    state=d.inspect(d.CONSOLE)
    d.run(['docker','build','--network=none','-t',image,str(d.ROOT/'source')],timeout=180)
    d.run(['docker','stop','--time','8',d.CONSOLE]);d.run(['docker','rename',d.CONSOLE,backup])
    nets=list(state['NetworkSettings']['Networks'])
    try:
        for net in nets:d.run(['docker','network','disconnect',net,backup])
        args=['docker','create','--name',d.CONSOLE,'--restart=no','--network',nets[0],
              '--read-only','--cap-drop=ALL','--security-opt=no-new-privileges','--cpus=0.75','--memory=768m','--memory-swap=768m','--pids-limit=128','--ulimit','core=0','--log-driver=none','-p','127.0.0.1:18787:8787']
        for mount in state['Mounts']:
            if mount['Type']=='bind':args+=['--mount','type=bind,src='+mount['Source']+',dst='+mount['Destination']+('' if mount['RW'] else ',readonly')]
        args+=['--tmpfs','/tmp:rw,nosuid,nodev,size=64m,mode=1777','--tmpfs','/workspace:rw,nosuid,nodev,size=16m,uid=10001,gid=10001,mode=700',image]
        d.run(args)
        for net in nets[1:]:d.run(['docker','network','connect',net,d.CONSOLE])
        d.run(['docker','start',d.CONSOLE]);d.ready(18787,'/healthz')
        after=d.snapshot();after.pop('/'+backup,None)
        if after!=before:raise RuntimeError('unrelated_container_changed')
        if json.loads(tasks.read_bytes() if tasks.exists() else b'[]')!=json.loads(initial):raise RuntimeError('task_state_changed')
        report=json.loads((d.ROOT/'admin-entry-release.json').read_text());report['consoleImage']=image
        report['identityReadCacheSeconds']=2
        (d.ROOT/'admin-entry-release.json').write_text(json.dumps(report))
        print(json.dumps({'updated':True,'image':image,'unchangedWebsite':True,'unchangedTasks':True,'modelCalls':0}))
    except Exception:
        subprocess.run(['docker','rm','-f',d.CONSOLE],capture_output=True)
        d.run(['docker','rename',backup,d.CONSOLE])
        for net in nets:d.run(['docker','network','connect',net,d.CONSOLE])
        d.run(['docker','start',d.CONSOLE]);raise
if __name__=='__main__':
    try:main()
    except Exception as e:print(json.dumps({'updated':False,'reason':str(e) if isinstance(e,RuntimeError) else type(e).__name__}));raise SystemExit(1)
