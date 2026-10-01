#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
: "${RELEASE_SHA:?RELEASE_SHA is required}"
[[ "$RELEASE_SHA" =~ ^[0-9a-f]{40}$ ]] || exit 2
ROOT=/opt/stock-release
SCRIPT=$(cd "$(dirname "$0")" && pwd)
IMAGE="registry.cn-hangzhou.aliyuncs.com/mufengtongxue/stock-front:$RELEASE_SHA"
RUN="$ROOT/front-runs/$(date -u +%Y%m%d-%H%M%S)-$RELEASE_SHA"
mkdir -p "$RUN"
exec 9>/var/lock/stock-back-release.lock
flock -n 9 || { echo 'Another release is running'; exit 1; }
old_id=stock-front
renamed=0
stopped=0
new_started=0
failure() {
  code=$?
  trap - EXIT
  [[ "$code" == 0 ]] && return
  printf 'failed\n' > "$RUN/phase"
  if [[ "$new_started" == 1 ]] && docker inspect stock-front >/dev/null 2>&1; then
    docker stop stock-front || true
    docker rename stock-front "stock-front-failed-${RELEASE_SHA:0:12}-$(date +%s)" || true
  fi
  if [[ "$renamed" == 1 ]]; then docker rename "$old_id" stock-front || true; fi
  if [[ "$stopped" == 1 ]]; then docker start "$old_id" || true; fi
  exit "$code"
}
trap failure EXIT
trap 'exit 130' INT TERM
if [[ -n "${DOCKER_PASSWORD:-}" ]]; then
  printf '%s' "$DOCKER_PASSWORD" | docker login --username "$DOCKER_USERNAME" --password-stdin registry.cn-hangzhou.aliyuncs.com
fi
# Keep the old frontend intact until the new immutable image and runtime config
# have both been verified; registry failure never removes the working version.
docker pull "$IMAGE"
docker run --rm "$IMAGE" nginx -t
docker inspect stock-front > "$RUN/old-container.json"
old_id=$(docker inspect --format '{{.Id}}' stock-front)
docker inspect --format '{{.Image}}' stock-front > "$RUN/old-image-id"
python3 "$SCRIPT/front-config.py" "$RUN/old-container.json" "$IMAGE" "$RELEASE_SHA" --validate
port=$(python3 -c 'import json,sys; c=json.load(open(sys.argv[1]))[0]; print(c["HostConfig"]["PortBindings"]["80/tcp"][0]["HostPort"])' "$RUN/old-container.json")
[[ "$port" =~ ^[0-9]+$ ]] || { echo 'Missing frontend HTTP port'; false; }
docker tag "$(cat "$RUN/old-image-id")" "stock-front-rollback:${RELEASE_SHA:0:12}"
old_name="stock-front-previous-${RELEASE_SHA:0:12}-$(date +%s)"
stopped=1
docker stop -t 30 "$old_id"
docker rename stock-front "$old_name"
renamed=1
printf '%s\n' "$old_name" > "$RUN/old-container-name"
new_started=1
python3 "$SCRIPT/front-config.py" "$RUN/old-container.json" "$IMAGE" "$RELEASE_SHA"
healthy=0
for attempt in $(seq 1 30); do
  if curl --fail --silent --max-time 5 --output /dev/null "http://127.0.0.1:$port/login/"; then healthy=1; break; fi
  sleep 2
done
[[ "$healthy" == 1 ]] || { echo 'New frontend failed HTTP checks'; false; }
printf 'success\n' > "$RUN/phase"
install -d -m 700 "$ROOT/tools"
install -m 700 "$SCRIPT/maintenance.py" "$ROOT/tools/maintenance.py"
python3 "$ROOT/tools/maintenance.py" --root "$ROOT" --apply > "$RUN/retention.json" || echo 'Release maintenance deferred; inspect retention logs'
echo "Frontend deployment verified: $RELEASE_SHA"
