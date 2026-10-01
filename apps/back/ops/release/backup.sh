#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
DIR=${1:?backup directory required}
BACKUP_IMAGE=${2:?image required}
BACKUP_ENV=${3:?runtime configuration required}
ROOT=/opt/stock-release
python3 - "$ROOT" "$DIR" <<'PY'
import pathlib,sys
root=pathlib.Path(sys.argv[1]).resolve()
target=pathlib.Path(sys.argv[2]).resolve()
if target.parent != root/'backups' or target.exists():
    raise SystemExit('Invalid or existing backup directory')
PY
mkdir -p "$DIR"
client="$DIR/client.cnf"
trap 'rm -f "$client"' EXIT
db() {
  docker run --rm --add-host host.docker.internal:172.17.0.1 --mount "type=bind,src=$BACKUP_ENV,dst=/run/stock/runtime.env,readonly" -e APP_ENV_FILE=/run/stock/runtime.env "$BACKUP_IMAGE" node ops/release/database.cjs "$@"
}
db backup-info > "$DIR/schema.json"
required=$(python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); assert d["database"]=="stock"; print(d["totalBytes"]*2+1024**3)' "$DIR/schema.json")
free=$(df -PB1 "$DIR" | awk 'NR==2 {print $4}')
[[ "$free" -ge "$required" ]] || { echo 'Insufficient independent backup space'; exit 1; }
db client-config > "$client"
# Streaming avoids a second uncompressed SQL file. InnoDB snapshot permits live
# application writes; the shared release lock excludes our own schema migrations.
mysqldump --defaults-extra-file="$client" --single-transaction --skip-lock-tables --quick --hex-blob --routines --events --triggers --set-gtid-purged=OFF stock | gzip -1 > "$DIR/stock.sql.gz.partial"
gzip -t "$DIR/stock.sql.gz.partial"
test -s "$DIR/stock.sql.gz.partial"
mv "$DIR/stock.sql.gz.partial" "$DIR/stock.sql.gz"
(cd "$DIR" && sha256sum stock.sql.gz > stock.sql.gz.sha256)
python3 - "$DIR" <<'PY'
import datetime,json,pathlib,sys
p=pathlib.Path(sys.argv[1])
schema=json.loads((p/'schema.json').read_text())
record=dict(schema,version=1,completedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),bytes=(p/'stock.sql.gz').stat().st_size,sha256=(p/'stock.sql.gz.sha256').read_text().split()[0])
(p/'backup.json.partial').write_text(json.dumps(record))
(p/'backup.json.partial').replace(p/'backup.json')
PY
printf 'Independent backup verified: %s\n' "$DIR"
