#!/usr/bin/python3
"""Narrow, reversible admin entry release. No model task is submitted."""
import hashlib,json,os,pathlib,re,subprocess,tarfile,time,urllib.request
os.umask(0o077)
ROOT=pathlib.Path('/opt/stock-personal-console')
FRONT='mufengtongxue-stock-front-1'
CONSOLE='stock-personal-console'
STAGE='stock-personal-console-front-stage'
OLD=CONSOLE+'-before-admin'
IMAGE='stock-personal-console:admin-entry-2'
FRONT_IMAGE='stock-front:personal-ai-admin-5135909d'
def run(args,timeout=90,**kw):
    p=subprocess.run(args,capture_output=True,timeout=timeout,**kw)
    if p.returncode:
        (ROOT/'admin-release-error.log').write_bytes(p.stdout[-5000:]+p.stderr[-5000:])
        raise RuntimeError('command_failed:'+args[0])
    return p.stdout
def inspect(name):return json.loads(run(['docker','inspect',name]))[0]
def snapshot():
    return {x['Name']:[x['Id'],x['State']['StartedAt'],x['RestartCount']] for x in json.loads(run(['docker','inspect']+run(['docker','ps','-aq']).decode().split())) if x['Name'] not in ['/'+FRONT,'/'+CONSOLE,'/'+STAGE,'/'+OLD]}
def http(port,path):
    with urllib.request.urlopen('http://127.0.0.1:'+str(port)+path,timeout=10) as r:return r.status,r.read()
def ready(port,path):
    for _ in range(20):
        try:
            if http(port,path)[0]==200:return
        except Exception:pass
        time.sleep(.5)
    raise RuntimeError('health_failed:'+str(port))
def compose():
    return ['docker','compose','--env-file','/opt/stock/deploy/release.env','-f','/opt/stock/deploy/compose.app.yaml','-f','/opt/stock/deploy/compose.production.yaml','up','-d','--no-deps','front']
def main():
    if (ROOT/'admin-entry-release.json').exists():raise RuntimeError('already_deployed')
    tasks=pathlib.Path('/srv/stock-personal-console/tasks.json')
    initial=tasks.read_bytes() if tasks.exists() else b'[]'
    if any(t['status'] in ['running','preparing','cancelling'] for t in json.loads(initial)):raise RuntimeError('active_task_preserved')
    before=snapshot();front=inspect(FRONT)
    if not front['Config']['Image'].endswith('db206a44c732b15981020a7396e870d94d69b6d1140bf180de6e84a6299ebde7'):raise RuntimeError('frontend_baseline_changed')
    source=ROOT/'source'; bundle=ROOT/'admin-front.tar.gz'; context=ROOT/'admin-front-build'
    context.mkdir(exist_ok=False)
    with tarfile.open(bundle) as archive:
        for entry in archive.getmembers():
            target=(context/entry.name).resolve()
            if not target.is_relative_to(context) or entry.issym() or entry.islnk():raise RuntimeError('unsafe_bundle')
        archive.extractall(context)
    (context/'Dockerfile').write_text('FROM '+front['Config']['Image']+'\nCOPY out/ /usr/share/nginx/html/\n')
    run(['docker','build','--network=none','-t',FRONT_IMAGE,str(context)],timeout=180)
    run(['docker','build','--network=none','-t',IMAGE,str(source)],timeout=180)
    run(['docker','run','--rm','--network=none','--entrypoint','/usr/local/bin/node',IMAGE,'--check','/app/server.mjs'])
    run(['docker','run','-d','--name',STAGE,'--restart=no','--security-opt=no-new-privileges','-p','127.0.0.1:18081:80',FRONT_IMAGE])
    ready(18081,'/admin/ai/')
    html=http(18081,'/admin/ai/')[1].decode()
    assets=set(re.findall(r'(?:src|href)="(/_next/[^"?]+\.(?:js|css))',html))
    if not assets:raise RuntimeError('missing_page_assets')
    for asset in assets:
        if http(18081,asset)[0]!=200:raise RuntimeError('missing_asset')
    site=pathlib.Path('/etc/nginx/sites-enabled/default').resolve()
    original=site.read_text(); env=pathlib.Path('/opt/stock/deploy/release.env');oldenv=env.read_text()
    if original.count('proxy_pass http://127.0.0.1:8081;')!=1:raise RuntimeError('unexpected_nginx')
    if len(re.findall(r'^FRONT_IMAGE=.*$',oldenv,re.M))!=1:raise RuntimeError('unexpected_release_env')
    (ROOT/'admin-nginx-before.conf').write_text(original)
    # Contains pre-existing deployment settings; root-only, never printed.
    (ROOT/'admin-release-before.env').write_text(oldenv)
    changed_console=False;changed_front=False
    try:
        run(['docker','stop','--time','8',CONSOLE]);run(['docker','rename',CONSOLE,OLD]);changed_console=True
        for net in ['stock-ai-proxy-net','mufengtongxue-stock-app']:run(['docker','network','disconnect',net,OLD])
        run(['docker','create','--name',CONSOLE,'--restart=no','--network','stock-ai-proxy-net',
             '--read-only','--cap-drop=ALL','--security-opt=no-new-privileges','--cpus=0.75','--memory=768m','--memory-swap=768m','--pids-limit=128','--ulimit','core=0','--log-driver=none',
             '-p','127.0.0.1:18787:8787','--mount','type=bind,src=/run/stock-codex/home,dst=/home/codex',
             '--mount','type=bind,src=/run/stock-codex/connection,dst=/run/connection,readonly',
             '--mount','type=bind,src='+str(ROOT/'config')+',dst=/run/console,readonly',
             '--mount','type=bind,src=/srv/stock-personal-console,dst=/data',
             '--tmpfs','/tmp:rw,nosuid,nodev,size=64m,mode=1777','--tmpfs','/workspace:rw,nosuid,nodev,size=16m,uid=10001,gid=10001,mode=700',IMAGE])
        run(['docker','network','connect','mufengtongxue-stock-app',CONSOLE]);run(['docker','start',CONSOLE]);ready(18787,'/healthz')
        site.write_text(original.replace('proxy_pass http://127.0.0.1:8081;','proxy_pass http://127.0.0.1:18081;'))
        run(['nginx','-t']);run(['systemctl','reload','nginx']);time.sleep(2)
        env.write_text(re.sub(r'^FRONT_IMAGE=.*$', 'FRONT_IMAGE='+FRONT_IMAGE,oldenv,flags=re.M));changed_front=True
        run(compose(),timeout=180);ready(8081,'/admin/ai/')
        site.write_text(original);run(['nginx','-t']);run(['systemctl','reload','nginx']);time.sleep(2)
        if snapshot()!=before:raise RuntimeError('unrelated_containers_changed')
        after=tasks.read_bytes() if tasks.exists() else b'[]'
        if json.loads(after)!=json.loads(initial):raise RuntimeError('task_state_changed')
        codes={}
        for path in ['/admin/','/admin/ai/','/login/','/review/','/strategy/','/basic/daily/']:
            code=run(['curl','--noproxy','*','-sS','--max-time','10','-o','/dev/null','-w','%{http_code}','https://14.103.103.4'+path]).decode()
            if code!='200':raise RuntimeError('public_page_unavailable')
            codes[path]=code
        report={'deployed':True,'url':'https://14.103.103.4/admin/ai/','sourceBase':'5135909d76b68f708a4692455d201dade4abfe07',
                'frontImage':FRONT_IMAGE,'consoleImage':IMAGE,'unchangedBackendAndOtherContainers':True,'pageHttp':codes,
                'assetsChecked':len(assets),'taskStateUnchanged':True,'modelCalls':0,'bundleSha256':hashlib.sha256(bundle.read_bytes()).hexdigest()}
        (ROOT/'admin-entry-release.json').write_text(json.dumps(report));print(json.dumps(report))
    except Exception:
        if changed_front:
            env.write_text(oldenv);run(compose(),timeout=180);ready(8081,'/login/')
        site.write_text(original);run(['nginx','-t']);run(['systemctl','reload','nginx'])
        if changed_console:
            subprocess.run(['docker','rm','-f',CONSOLE],capture_output=True)
            run(['docker','rename',OLD,CONSOLE])
            for net in ['stock-ai-proxy-net','mufengtongxue-stock-app']:run(['docker','network','connect',net,CONSOLE])
            run(['docker','start',CONSOLE])
        raise
    finally:
        subprocess.run(['docker','rm','-f',STAGE],capture_output=True)
if __name__=='__main__':
    try:main()
    except Exception as e:print(json.dumps({'deployed':False,'reason':str(e) if isinstance(e,RuntimeError) else type(e).__name__}));raise SystemExit(1)
