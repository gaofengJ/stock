#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
ROOT=/opt/stock-release
exec 9>/var/lock/stock-back-release.lock
flock -n 9 || { echo 'Release in progress; daily backup deferred'; exit 0; }
IMAGE=$(docker inspect --format '{{.Image}}' stock-back)
SHA=$(docker inspect --format '{{index .Config.Labels "stock.release.sha"}}' stock-back)
ENV_FILE=$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/run/stock/runtime.env"}}{{.Source}}{{end}}{{end}}' stock-back)
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] && [[ -s "$ENV_FILE" ]]
python3 - "$ROOT" "$ENV_FILE" <<'PY'
import os,pathlib,sys
root=pathlib.Path(sys.argv[1]).resolve()
env=pathlib.Path(sys.argv[2]).resolve()
if os.path.commonpath([str(env),str(root/'packages')])!=str(root/'packages') or env.name!='runtime.env':
    raise SystemExit('Unexpected active runtime configuration')
PY
bash "$ROOT/tools/backup.sh" "$ROOT/backups/$(date -u +%Y%m%d-%H%M%S)-daily-$SHA" "$IMAGE" "$ENV_FILE"
python3 "$ROOT/tools/maintenance.py" --root "$ROOT" --apply
