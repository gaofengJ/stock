#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
: "${RELEASE_SHA:?RELEASE_SHA is required}"
[[ "$RELEASE_SHA" =~ ^[0-9a-f]{40}$ ]] || exit 2
ROOT=/opt/stock-release
PACKAGE="$(cd "$(dirname "$0")/.." && pwd)"
RUN=${1:?release run directory required}
exec 9>/var/lock/stock-back-release.lock
flock -w 300 9 || { echo 'Another release is running'; exit 1; }
python3 - "$ROOT" "$RUN" "$RELEASE_SHA" <<'PY'
import pathlib, sys
root, run = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
if run.parent != root/'runs' or run.resolve() != run or not run.name.endswith('-'+sys.argv[3]):
    raise SystemExit('Unexpected release directory')
if (run/'phase').read_text().strip() not in ('application-verified', 'post-deploy-pending', 'success'):
    raise SystemExit('Application verification must succeed before retrying')
PY
[[ "$(docker inspect --format '{{index .Config.Labels "stock.release.sha"}}' stock-back)" == "$RELEASE_SHA" ]]
[[ "$(docker inspect --format '{{.State.Running}}' stock-back)" == true ]]
ENV_FILE="$PACKAGE/release/runtime.env"
[[ "$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/run/stock/runtime.env"}}{{.Source}}{{end}}{{end}}' stock-back)" == "$ENV_FILE" ]]
IMAGE=$(docker inspect --format '{{.Image}}' stock-back)
docker exec stock-back node ops/release/smoke.cjs
source "$PACKAGE/release/post-deploy.sh"
complete_release "$RUN" "$PACKAGE" "$IMAGE" "$ENV_FILE"
echo 'Post-deployment steps completed without restarting the application'
