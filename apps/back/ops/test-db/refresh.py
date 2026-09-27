#!/usr/bin/python3
"""Root-owned wrapper; credentials travel through stdin, never command arguments."""
import datetime
import json
import os
import subprocess
import sys
import time

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
with open(ROOT + '/history-refresh.cjs') as handle:
    history = handle.read()
# Old days=30 config files must never reactivate the destructive legacy refresh.
config['years'] = 2
config.pop('days', None)
deadline = time.monotonic() + 240
try:
    first = True
    while time.monotonic() < deadline and not os.path.exists(ROOT + '/PAUSED'):
        prefix = ('const historyRefresh = (() => { const module = {exports:{}};\n' + history + '\nreturn module.exports; })();\n'
                  + 'const config = ' + json.dumps(config) + ';\nconst state = ' + json.dumps(state)
                  + ';\nconst force = ' + json.dumps(first and '--force' in sys.argv) + ';\n')
        result = subprocess.run(['docker', 'exec', '-i', 'stock-back', 'node'], input=prefix + script, stdout=subprocess.PIPE, stderr=subprocess.PIPE, universal_newlines=True, timeout=180)
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
            print(datetime.datetime.now().isoformat(), json.dumps({key: value for key, value in output.items() if key not in ('copied', 'identity', 'references') and 'Fingerprint' not in key}), flush=True)
        first = False
        if output['status'] != 'copied' or not output.get('remaining'):
            break
        time.sleep(1)
except Exception as error:
    print(datetime.datetime.now().isoformat(), 'refresh failed:', str(error))
    sys.exit(1)
