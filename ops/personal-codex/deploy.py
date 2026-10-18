#!/usr/bin/python3
"""Run on the authorized host after copying this directory. No model inference is performed."""
import json, os, pathlib, re, shutil, subprocess, time, urllib.request, hashlib, sys
os.umask(0o077)
ROOT=pathlib.Path('/opt/stock-personal-console')
SOURCE=ROOT/'source'
SERVICE='stock-personal-console'
BACK='mufengtongxue-stock-back-1'
ORIGIN='https://14.103.103.4'
def run(args, **kw):
    p=subprocess.run(args,capture_output=True,timeout=kw.pop('timeout',30),**kw)
    if p.returncode:raise RuntimeError('command_failed:'+args[0])
    return p
def snapshot():
    ids=run(['docker','ps','-aq']).stdout.decode().split()
    objects=json.loads(run(['docker','inspect']+ids).stdout)
    return {x['Name']:{'id':x['Id'],'startedAt':x['State']['StartedAt'],'restarts':x['RestartCount'],'status':x['State']['Status']} for x in objects if x['Name']!='/'+SERVICE}
def health():
    with urllib.request.urlopen('http://127.0.0.1:18787/healthz',timeout=3) as r:return r.status==200
def main():
    if os.geteuid()!=0 or not SOURCE.is_dir():raise RuntimeError('invalid_deployment_context')
    if (ROOT/'deployment.json').exists():raise RuntimeError('already_installed_use_explicit_update')
    existing=subprocess.run(['docker','inspect',SERVICE],capture_output=True)
    if existing.returncode==0:
        datafile=pathlib.Path('/srv/stock-personal-console/tasks.json')
        state=json.loads(existing.stdout)[0]
        if '--resume-incomplete' not in sys.argv or not (ROOT/'before.json').exists() or state['Config']['Image']!='stock-personal-console:1' or (datafile.exists() and json.loads(datafile.read_text())):
            raise RuntimeError('existing_container_preserved')
        run(['systemctl','stop','stock-personal-console.service'])
        run(['docker','rm',SERVICE])
    before=snapshot()
    if (ROOT/'before.json').exists():
        if json.loads((ROOT/'before.json').read_text())!=before:raise RuntimeError('website_baseline_changed')
    else:(ROOT/'before.json').write_text(json.dumps(before))
    # Bind the explicitly supplied username to an immutable database ID; never guess an admin account.
    js="""const fs=require('fs'),env=require('dotenv').parse(fs.readFileSync(process.env.APP_ENV_FILE)),mysql=require('mysql2/promise');(async()=>{const c=await mysql.createConnection({host:process.env.DB_HOST,port:Number(process.env.DB_PORT),user:env.DB_USERNAME,password:env.DB_PASSWORD,database:process.env.DB_DATABASE||process.env.DB_DATABASE_NAME||env.DB_DATABASE});const[r]=await c.query("SELECT u.id,u.username,u.is_active,EXISTS(SELECT 1 FROM t_user_role ur JOIN t_role r ON r.id=ur.role_id WHERE ur.user_id=u.id AND r.code='admin') is_admin FROM t_user u WHERE u.username=?",['mufeng']);console.log(JSON.stringify(r));await c.end()})().catch(()=>process.exit(1));"""
    owners=json.loads(run(['docker','exec',BACK,'node','-e',js]).stdout)
    if len(owners)!=1 or owners[0]['username']!='mufeng' or owners[0]['is_active']!=1 or owners[0]['is_admin']!=1:raise RuntimeError('owner_not_verified')
    owner=owners[0]
    # Pull no mutable tags or external runtime. Extract only Node and resolved shared libraries.
    runtime=SOURCE/'runtime';runtime.mkdir(mode=0o755,exist_ok=True)
    paths={'/usr/local/bin/node'}|set(re.findall(r'(/[^\s()]+)',run(['docker','exec',BACK,'ldd','/usr/local/bin/node']).stdout.decode()))
    for path in sorted(paths):
        dest=runtime/path.lstrip('/');dest.parent.mkdir(parents=True,exist_ok=True)
        run(['docker','cp','-L',BACK+':'+path,str(dest)])
        dest.chmod(0o755)
    for item in SOURCE.rglob('*'):
        if item.is_dir():item.chmod(0o755)
        elif not str(item).startswith(str(runtime)):item.chmod(0o644)
    image='stock-personal-console:1'
    run(['docker','build','--network=none','-t',image,str(SOURCE)],timeout=180)
    run(['docker','run','--rm','--network=none','--entrypoint','/usr/local/bin/node',image,'--check','/app/server.mjs'])
    run(['docker','run','--rm','--network=none','--entrypoint','/usr/local/bin/codex',image,'--version'])
    configdir=ROOT/'config';configdir.mkdir(mode=0o755,exist_ok=True);configdir.chmod(0o755)
    config={'ownerId':owner['id'],'origin':ORIGIN,'backend':'http://'+BACK+':3000/api','enabled':True,'dataDir':'/data'}
    (configdir/'config.json').write_text(json.dumps(config));(configdir/'config.json').chmod(0o444)
    shutil.copy2('/opt/stock-codex/owner.sha256',configdir/'owner.sha256');(configdir/'owner.sha256').chmod(0o444)
    data=pathlib.Path('/srv/stock-personal-console');data.mkdir(mode=0o700,exist_ok=True);os.chown(data,10001,10001)
    controller=ROOT/'host-control.py';shutil.copy2(SOURCE/'host-control.py',controller);controller.chmod(0o700)
    run(['python3',str(controller),'prepare'],timeout=200)
    # Shared runtime auth has one canonical encrypted checkpoint; no token copies in images or durable task storage.
    run(['docker','create','--name',SERVICE,'--restart=no','--network','stock-ai-proxy-net',
         '--read-only','--cap-drop=ALL','--security-opt=no-new-privileges','--cpus=0.75','--memory=768m','--memory-swap=768m','--pids-limit=128','--ulimit','core=0','--log-driver=none',
         '--publish','127.0.0.1:18787:8787',
         '--mount','type=bind,src=/run/stock-codex/home,dst=/home/codex',
         '--mount','type=bind,src=/run/stock-codex/connection,dst=/run/connection,readonly',
         '--mount','type=bind,src='+str(configdir)+',dst=/run/console,readonly',
         '--mount','type=bind,src='+str(data)+',dst=/data',
         '--tmpfs','/tmp:rw,nosuid,nodev,size=64m,mode=1777',
         '--tmpfs','/workspace:rw,nosuid,nodev,size=16m,uid=10001,gid=10001,mode=700',image])
    run(['docker','network','connect','mufengtongxue-stock-app',SERVICE])
    unit=pathlib.Path('/etc/systemd/system')
    (unit/'stock-personal-console.service').write_text('''[Unit]
Description=Personal-only stock Codex console
After=docker.service network-online.target
Requires=docker.service
[Service]
Type=oneshot
RemainAfterExit=yes
ExecStartPre=/usr/bin/python3 /opt/stock-personal-console/host-control.py prepare
ExecStart=/usr/bin/docker start stock-personal-console
ExecStop=/usr/bin/python3 /opt/stock-personal-console/host-control.py stop
TimeoutStartSec=240
TimeoutStopSec=20
[Install]
WantedBy=multi-user.target
''')
    (unit/'stock-personal-console-checkpoint.service').write_text('''[Unit]
Description=Encrypt personal Codex refreshed credentials
[Service]
Type=oneshot
UMask=0077
ExecStart=/usr/bin/python3 /opt/stock-personal-console/host-control.py checkpoint
''')
    (unit/'stock-personal-console-checkpoint.path').write_text('''[Unit]
Description=Watch personal Codex credential checkpoint requests
After=stock-personal-console.service
[Path]
PathChanged=/run/stock-codex/home/checkpoint
Unit=stock-personal-console-checkpoint.service
[Install]
WantedBy=multi-user.target
''')
    run(['systemctl','daemon-reload']);run(['systemctl','enable','--now','stock-personal-console.service','stock-personal-console-checkpoint.path'],timeout=240)
    for _ in range(10):
        try:
            if health():break
        except Exception:pass
        time.sleep(1)
    else:raise RuntimeError('console_health_failed')
    site=pathlib.Path('/etc/nginx/sites-enabled/default').resolve()
    original=site.read_text(); backup=ROOT/'nginx-before.conf';backup.write_text(original)
    marker='  location /api/ {'
    if original.count(marker)!=1 or '/personal-ai/' in original:raise RuntimeError('nginx_layout_unexpected')
    block='''  # Personal Codex console: isolated service; existing website upstreams unchanged.
  location = /personal-ai { return 308 /personal-ai/; }
  location ^~ /personal-ai/ {
    client_max_body_size 20k;
    proxy_pass http://127.0.0.1:18787;
    proxy_read_timeout 40s;
    proxy_buffering off;
    access_log off;
  }
'''
    try:
        site.write_text(original.replace(marker,block+marker,1))
        run(['nginx','-t']);run(['systemctl','reload','nginx'])
        assert snapshot()==before
        # Anonymous access must be denied before returning any console or task content.
        for _ in range(10):
            p=run(['curl','--noproxy','*','--silent','--show-error','--max-time','5','--output','/dev/null','--write-out','%{http_code}',ORIGIN+'/personal-ai/'])
            if p.stdout.strip()==b'401':break
            time.sleep(1)
        else:raise RuntimeError('anonymous_access_not_denied:'+p.stdout.decode())
        for path in ['/login/','/review/']:
            p=run(['curl','--silent','--show-error','--max-time','15','--output','/dev/null','--write-out','%{http_code}',ORIGIN+path])
            if p.stdout.strip()!=b'200':raise RuntimeError('website_page_check_failed')
    except Exception:
        site.write_text(original);run(['nginx','-t']);run(['systemctl','reload','nginx']);raise
    report={'deployed':True,'url':ORIGIN+'/personal-ai/','ownerId':owner['id'],'ownerUsername':'mufeng','image':image,
            'websiteContainersUnchanged':snapshot()==before,'anonymousDenied':True,'modelCallsDuringDeployment':0,
            'credentialsEncrypted':True,'ports':'127.0.0.1:18787 only','nginxBackup':str(backup)}
    (ROOT/'deployment.json').write_text(json.dumps(report));print(json.dumps(report))
if __name__=='__main__':
    try:main()
    except Exception as e:print(json.dumps({'deployed':False,'errorType':type(e).__name__,'reason':str(e) if isinstance(e,RuntimeError) else 'verification_failed'}));raise SystemExit(1)
