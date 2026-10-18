#!/usr/bin/python3
"""Blue/green frontend-only release for native business AI panels. No inference."""
import hashlib,json,os,pathlib,re,subprocess,tarfile,time,urllib.request
os.umask(0o077)
ROOT=pathlib.Path('/opt/stock-personal-console')
FRONT='mufengtongxue-stock-front-1'
BASE='stock-front:personal-ai-admin-5135909d'
IMAGE='stock-front:personal-ai-native-20261018'
STAGE='stock-personal-console-native-stage'
def run(args,timeout=90):
    p=subprocess.run(args,capture_output=True,timeout=timeout)
    if p.returncode:
        (ROOT/'native-release-error.log').write_bytes(p.stdout[-4000:]+p.stderr[-4000:])
        raise RuntimeError('command_failed:'+args[0])
    return p.stdout
def inspect(name):return json.loads(run(['docker','inspect',name]))[0]
def snapshot():
    return {x['Name']:[x['Id'],x['State']['StartedAt'],x['RestartCount']] for x in json.loads(run(['docker','inspect']+run(['docker','ps','-aq']).decode().split())) if x['Name'] not in ['/'+FRONT,'/'+STAGE]}
def get(port,path):
    with urllib.request.urlopen('http://127.0.0.1:'+str(port)+path,timeout=10) as r:return r.status,r.read()
def ready(port):
    for _ in range(20):
        try:
            if get(port,'/admin/ai/')[0]==200:return
        except Exception:pass
        time.sleep(.5)
    raise RuntimeError('front_not_ready')
def compose():return ['docker','compose','--env-file','/opt/stock/deploy/release.env','-f','/opt/stock/deploy/compose.app.yaml','-f','/opt/stock/deploy/compose.production.yaml','up','-d','--no-deps','front']
def main():
    if (ROOT/'native-ui-release.json').exists():raise RuntimeError('already_deployed')
    before=snapshot()
    if inspect(FRONT)['Config']['Image']!=BASE:raise RuntimeError('baseline_changed')
    tasks=pathlib.Path('/srv/stock-personal-console/tasks.json')
    before_tasks=tasks.read_bytes() if tasks.exists() else b'[]'
    context=ROOT/'native-front-build';context.mkdir(exist_ok=True)
    if context.resolve()!=context:raise RuntimeError('invalid_build_directory')
    bundle=ROOT/'front-native.tar.gz'
    with tarfile.open(bundle) as archive:
        for member in archive.getmembers():
            if not (context/member.name).resolve().is_relative_to(context) or member.issym() or member.islnk():raise RuntimeError('unsafe_bundle')
        archive.extractall(context)
    # Selective archives omit parent directories; normalize public-only export permissions.
    (context/'out').chmod(0o755)
    for entry in (context/'out').rglob('*'):entry.chmod(0o755 if entry.is_dir() else 0o644)
    (context/'Dockerfile').write_text('FROM '+BASE+'\nCOPY out/ /usr/share/nginx/html/\n')
    run(['docker','build','--network=none','-t',IMAGE,str(context)],timeout=180)
    site=pathlib.Path('/etc/nginx/sites-enabled/default').resolve()
    original=site.read_text();env=pathlib.Path('/opt/stock/deploy/release.env');oldenv=env.read_text()
    if original.count('proxy_pass http://127.0.0.1:8081;')!=1 or len(re.findall(r'^FRONT_IMAGE=.*$',oldenv,re.M))!=1:raise RuntimeError('unexpected_front_config')
    (ROOT/'native-nginx-before.conf').write_text(original);(ROOT/'native-release-before.env').write_text(oldenv)
    changed=False
    try:
        run(['docker','run','-d','--name',STAGE,'--restart=no','--security-opt=no-new-privileges','-p','127.0.0.1:18081:80',IMAGE]);ready(18081)
        assets=set()
        for path in ['/admin/ai/','/admin/users/','/review/','/strategy/']:
            html=get(18081,path)[1].decode()
            assets.update(re.findall(r'(?:src|href)="(/_next/[^"?]+\.(?:js|css))',html))
        if len(assets)<20:raise RuntimeError('missing_static_assets')
        for asset in assets:get(18081,asset)
        site.write_text(original.replace('proxy_pass http://127.0.0.1:8081;','proxy_pass http://127.0.0.1:18081;'))
        run(['nginx','-t']);run(['systemctl','reload','nginx']);time.sleep(2)
        env.write_text(re.sub(r'^FRONT_IMAGE=.*$', 'FRONT_IMAGE='+IMAGE,oldenv,flags=re.M));changed=True
        run(compose(),timeout=180);ready(8081)
        site.write_text(original);run(['nginx','-t']);run(['systemctl','reload','nginx']);time.sleep(2)
        if snapshot()!=before:raise RuntimeError('unrelated_container_changed')
        after_tasks=tasks.read_bytes() if tasks.exists() else b'[]'
        if json.loads(after_tasks)!=json.loads(before_tasks):raise RuntimeError('task_state_changed')
        codes={}
        for path in ['/admin/ai/','/admin/users/','/review/','/strategy/','/login/','/basic/daily/']:
            status=run(['curl','--noproxy','*','-sS','--max-time','10','-o','/dev/null','-w','%{http_code}','https://14.103.103.4'+path]).decode()
            if status!='200':raise RuntimeError('public_route_failed')
            codes[path]=status
        report={'deployed':True,'frontImage':IMAGE,'previousFrontImage':BASE,'assetsChecked':len(assets),'pageHttp':codes,
                'backendAndConsoleUnchanged':True,'taskStateUnchanged':True,'modelCalls':0,'bundleSha256':hashlib.sha256(bundle.read_bytes()).hexdigest()}
        (ROOT/'native-ui-release.json').write_text(json.dumps(report));print(json.dumps(report))
    except Exception:
        if changed:env.write_text(oldenv);run(compose(),timeout=180);ready(8081)
        site.write_text(original);run(['nginx','-t']);run(['systemctl','reload','nginx']);raise
    finally:subprocess.run(['docker','rm','-f',STAGE],capture_output=True)
if __name__=='__main__':
    try:main()
    except Exception as e:print(json.dumps({'deployed':False,'reason':str(e) if isinstance(e,RuntimeError) else type(e).__name__}));raise SystemExit(1)
