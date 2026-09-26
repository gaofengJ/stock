#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

# All inputs describe this repository's existing production installation.
: "${RELEASE_SHA:?RELEASE_SHA is required}"
[[ "$RELEASE_SHA" =~ ^[0-9a-f]{40}$ ]] || exit 2
ROOT=/opt/stock-release
PACKAGE="$(cd "$(dirname "$0")/.." && pwd)"
IMAGE="registry.cn-hangzhou.aliyuncs.com/mufengtongxue/stock-back:$RELEASE_SHA"
RUN="$ROOT/runs/$(date +%Y%m%d-%H%M%S)-$RELEASE_SHA"
mkdir -p "$RUN"
exec 9>/var/lock/stock-back-release.lock
flock -n 9 || { echo 'Another release is running'; exit 1; }
stopped=0
migration_started=0
paused_by_release=0
old_name=stock-back
old_id=stock-back
new_started=0
client="$RUN/client.cnf"
restore_refresh() {
  if [[ "$paused_by_release" == 1 ]]; then rm -f /opt/stock-test/PAUSED; fi
}
failure() {
  code=$?
  trap - EXIT
  [[ "$code" == 0 ]] && return
  rm -f "$client"
  printf 'FAILED phase=%s report=%s\n' "$migration_started" "$RUN" >&2
  if [[ "$migration_started" == 0 ]]; then
    if [[ "$stopped" == 1 ]]; then
      if [[ "$old_name" != stock-back ]]; then docker rename "$old_id" stock-back || true; fi
      docker start "$old_id" || true
    fi
    restore_refresh
  else
    if [[ "$new_started" == 1 ]]; then docker stop stock-back || true; fi
    echo 'Migration may have committed DDL. Old container stays stopped. Follow recovery.md; do not blindly downgrade or restore over this database.' >&2
  fi
  exit "$code"
}
trap failure EXIT
trap 'exit 130' INT TERM

if [[ -n "${DOCKER_PASSWORD:-}" ]]; then
  printf '%s' "$DOCKER_PASSWORD" | docker login --username "$DOCKER_USERNAME" --password-stdin registry.cn-hangzhou.aliyuncs.com
fi
docker pull "$IMAGE"
docker image inspect "$IMAGE" > "$RUN/new-image.json"
docker inspect stock-back > "$RUN/old-container.json"
old_id=$(docker inspect --format '{{.Id}}' stock-back)
docker inspect --format '{{.Image}}' stock-back > "$RUN/old-image-id"
old_image=$(cat "$RUN/old-image-id")
docker tag "$old_image" "stock-back-rollback:${RELEASE_SHA:0:12}"

db() {
  docker run --rm --add-host host.docker.internal:172.17.0.1 "$IMAGE" node ops/release/database.cjs "$@"
}
db preflight > "$RUN/preflight.json"
required=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["requiredFreeBytes"])' "$RUN/preflight.json")
database=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["database"])' "$RUN/preflight.json")
[[ "$database" == stock ]] || { echo 'Unexpected production database'; false; }
free=$(df -PB1 "$RUN" | awk 'NR==2 {print $4}')
[[ "$free" -ge "$required" ]] || { echo 'Insufficient backup/migration disk space'; false; }

if [[ ! -f /opt/stock-test/PAUSED ]]; then touch /opt/stock-test/PAUSED; paused_by_release=1; fi
flock /var/lock/stock-test-refresh.lock true
cp -p /opt/stock-test/refresh.cjs "$RUN/previous-refresh.cjs"
cp -p /opt/stock-test/refresh.py "$RUN/previous-refresh.py"
install -m 600 "$PACKAGE/test-db/refresh.cjs" /opt/stock-test/refresh.cjs
install -m 700 "$PACKAGE/test-db/refresh.py" /opt/stock-test/refresh.py
stopped=1
docker stop -t 60 "$old_id"
db client-config > "$client"
mysqldump --defaults-extra-file="$client" --single-transaction --skip-lock-tables --quick --hex-blob --routines --events --triggers --set-gtid-purged=OFF "$database" | gzip -1 > "$RUN/stock.sql.gz"
gzip -t "$RUN/stock.sql.gz"
test -s "$RUN/stock.sql.gz"
sha256sum "$RUN/stock.sql.gz" > "$RUN/stock.sql.gz.sha256"
rm -f "$client"
old_name="stock-back-previous-${RELEASE_SHA:0:12}-$(date +%s)"
docker rename stock-back "$old_name"
printf '%s\n' "$old_name" > "$RUN/old-container-name"
# Mark before launching: a disconnected migration client may already have committed.
migration_started=1
printf 'migration-started\n' > "$RUN/phase"
db migrate > "$RUN/migration.jsonl"
db verify > "$RUN/verification.json"
new_started=1
docker run --restart unless-stopped --add-host host.docker.internal:172.17.0.1 -e SYNC_ON_STARTUP=false -d -p 3000:3000 -v /home/logs/stock-back:/usr/src/app/apps/back/logs --name stock-back "$IMAGE"
healthy=0
for attempt in $(seq 1 30); do
  if docker exec stock-back node ops/release/smoke.cjs; then healthy=1; break; fi
  sleep 2
done
[[ "$healthy" == 1 ]] || { echo 'New application failed API checks'; false; }
restore_refresh
printf 'success\n' > "$RUN/phase"
echo "Deployment verified: $RELEASE_SHA; backup and recovery data: $RUN"
