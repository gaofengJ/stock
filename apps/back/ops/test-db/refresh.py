#!/usr/bin/python3
"""Root-owned wrapper; credentials travel through stdin, never command arguments."""
import datetime
import json
import os
import subprocess
import sys

ROOT = '/opt/stock-test'
if os.path.exists(ROOT + '/PAUSED'):
    sys.exit(0)
with open(ROOT + '/config.json') as handle:
    config = json.load(handle)
state = {}
if os.path.exists(ROOT + '/state.json'):
    with open(ROOT + '/state.json') as handle:
        state = json.load(handle)
with open(ROOT + '/refresh.cjs') as handle:
    script = handle.read()
prefix = 'const config = ' + json.dumps(config) + ';\nconst state = ' + json.dumps(state) + ';\nconst force = ' + json.dumps('--force' in sys.argv) + ';\n'
try:
    result = subprocess.run(['docker', 'exec', '-i', 'stock-back', 'node'], input=prefix + script, stdout=subprocess.PIPE, stderr=subprocess.PIPE, universal_newlines=True, timeout=600)
    output = json.loads(result.stdout.strip())
    if result.returncode:
        raise RuntimeError(output.get('error', 'refresh failed'))
    state.update(output)
    temporary = ROOT + '/state.json.tmp'
    with open(temporary, 'w') as handle:
        json.dump(state, handle)
    os.chmod(temporary, 0o600)
    os.replace(temporary, ROOT + '/state.json')
    if output['status'] not in ('unchanged', 'busy'):
        print(datetime.datetime.now().isoformat(), json.dumps({key: value for key, value in output.items() if 'Fingerprint' not in key}))
except Exception as error:
    print(datetime.datetime.now().isoformat(), 'refresh failed:', str(error))
    sys.exit(1)
