#!/usr/bin/python3
"""Redirect the retired UI only; preserve all protected console API routes."""
import json,pathlib,subprocess,time
ROOT=pathlib.Path('/opt/stock-personal-console')
site=pathlib.Path('/etc/nginx/sites-enabled/default').resolve()
original=site.read_text()
old='  location = /personal-ai { return 308 /personal-ai/; }'
new='  location = /personal-ai { return 302 /admin/ai/; }\n  location = /personal-ai/ { return 302 /admin/ai/; }'
def run(args):return subprocess.check_output(args,stderr=subprocess.PIPE,timeout=20)
try:
    if new not in original:
        if original.count(old)!=1:raise RuntimeError('unexpected_route')
        backup=ROOT/'legacy-entry-nginx-before.conf'
        if not backup.exists():backup.write_text(original);backup.chmod(0o600)
        site.write_text(original.replace(old,new))
        run(['nginx','-t']);run(['systemctl','reload','nginx']);time.sleep(2)
    status={}
    for path,expected in [('/personal-ai','302'),('/personal-ai/','302'),('/personal-ai/api/status','401')]:
        code=run(['curl','--noproxy','*','-sS','--max-time','10','-o','/dev/null','-w','%{http_code}','https://14.103.103.4'+path]).decode()
        if code!=expected:raise RuntimeError('route_check_failed')
        status[path]=code
    print(json.dumps({'legacyUiRedirected':True,'apiProtected':True,'status':status,'modelCalls':0}))
except Exception as error:
    site.write_text(original);run(['nginx','-t']);run(['systemctl','reload','nginx'])
    print(json.dumps({'legacyUiRedirected':False,'reason':str(error) if isinstance(error,RuntimeError) else type(error).__name__}))
    raise SystemExit(1)
