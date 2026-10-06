"""Render the dedicated credential without putting it in shell arguments or logs."""
import os
from pathlib import Path
import re
import sys

token = os.environ.get('NEWS_DISPATCH_TOKEN', '')
if not re.match(r'^[A-Za-z0-9_]{20,512}\Z', token):
    raise SystemExit('Configure NEWS_DISPATCH_TOKEN with repository Actions read/write permission')
file = Path(sys.argv[1])
descriptor = os.open(str(file), os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
with os.fdopen(descriptor, 'w') as stream:
    stream.write('NEWS_DISPATCH_TOKEN=' + token + '\n')
