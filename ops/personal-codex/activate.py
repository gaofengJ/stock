#!/usr/bin/python3
"""Resume route activation after a successfully built, healthy isolated service."""
import pathlib,json,subprocess,time
from deploy import ROOT,SERVICE,ORIGIN,run,snapshot,health
def main():
    if not health():raise RuntimeError('console_not_healthy')
    before=json.loads((ROOT/'before.json').read_text())
    if snapshot()!=before:raise RuntimeError('existing_website_changed')
    site=pathlib.Path('/etc/nginx/sites-enabled/default').resolve()
    original=site.read_text();backup=ROOT/'nginx-before.conf'
    if not backup.exists() or backup.read_text()!=original:raise RuntimeError('nginx_baseline_changed')
    marker='  location /api/ {'
    if original.count(marker)!=1 or '/personal-ai/' in original:raise RuntimeError('unexpected_route')
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
    observed=[]
    try:
        site.write_text(original.replace(marker,block+marker,1));run(['nginx','-t']);run(['systemctl','reload','nginx'])
        for _ in range(10):
            code=run(['curl','--noproxy','*','--silent','--max-time','5','--output','/dev/null','--write-out','%{http_code}',ORIGIN+'/personal-ai/']).stdout.decode().strip()
            observed.append(code)
            if code=='401':break
            time.sleep(1)
        else:raise RuntimeError('unexpected_anonymous_status:'+','.join(observed))
        website={}
        for path in ['/login/','/review/']:
            website[path]=run(['curl','--noproxy','*','--silent','--max-time','10','--output','/dev/null','--write-out','%{http_code}',ORIGIN+path]).stdout.decode().strip()
            if website[path]!='200':raise RuntimeError('website_check_failed')
        if snapshot()!=before:raise RuntimeError('website_container_changed')
    except Exception:
        site.write_text(original);run(['nginx','-t']);run(['systemctl','reload','nginx']);raise
    report={'deployed':True,'url':ORIGIN+'/personal-ai/','ownerId':1,'ownerUsername':'mufeng','image':'stock-personal-console:1',
            'websiteContainersUnchanged':True,'websiteHttp':website,'anonymousDenied':True,'activationStatuses':observed,
            'modelCallsDuringDeployment':0,'credentialsEncrypted':True,'ports':'127.0.0.1:18787 only','nginxBackup':str(backup)}
    (ROOT/'deployment.json').write_text(json.dumps(report));print(json.dumps(report))
if __name__=='__main__':
    try:main()
    except Exception as e:print(json.dumps({'deployed':False,'error':str(e) if isinstance(e,RuntimeError) else type(e).__name__}));raise SystemExit(1)
