#!/bin/sh
# Installed as /home/stock-blog-deploy.sh; called by the article release workflow.
set -eu
registry=registry.cn-hangzhou.aliyuncs.com/mufengtongxue/stock-blog
exec 9>"${BLOG_DEPLOY_LOCK:-/var/lock/stock-blog-full-release.lock}"
flock -n 9 || { echo 'Another article deployment is running'; exit 1; }

if [ -n "${DOCKER_USERNAME:-}" ] && [ -n "${DOCKER_PASSWORD:-}" ]; then
  printf '%s' "$DOCKER_PASSWORD" | docker login --username "$DOCKER_USERNAME" --password-stdin registry.cn-hangzhou.aliyuncs.com
fi
status=$(curl --max-time 10 -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/api/auth/blog-access)
[ "$status" = 401 ] || [ "$status" = 403 ] || { echo 'Backend article access check is not ready'; exit 1; }

# Downloads and validation must finish while the previous service is still running.
docker pull "$registry:latest"
image=$(docker image inspect --format '{{.Id}}' "$registry:latest")
docker run --rm "$image" nginx -t
current=$(docker inspect --format '{{.Image}}' stock-blog 2>/dev/null || true)
running=$(docker inspect --format '{{.State.Running}}' stock-blog 2>/dev/null || true)
if [ "$current" = "$image" ] && [ "$running" = true ]; then
  echo 'Requested article image is already running.'
  exit 0
fi

backup=stock-blog-previous-$(date +%Y%m%d%H%M%S)-$$
renamed=0
created=0
rollback() {
  code=$?
  trap - 0
  if [ "$code" != 0 ]; then
    echo 'Article deployment failed; restoring the previous container.' >&2
    if [ "$created" = 1 ]; then docker rm -f stock-blog || true; fi
    if [ "$renamed" = 1 ]; then
      docker start "$backup" || true
      docker rename "$backup" stock-blog || true
    fi
  fi
  exit "$code"
}
trap rollback 0
if [ -n "$current" ]; then
  docker rename stock-blog "$backup"
  renamed=1
  docker stop "$backup"
fi
# Set before run so rollback also removes a created container that failed to start.
created=1
docker run --restart unless-stopped -d -p 8082:80 --name stock-blog "$image"
docker exec stock-blog nginx -t
attempt=0
while [ "$attempt" -lt 10 ]; do
  status=$(curl --max-time 10 -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8082/ || true)
  if [ "$status" = 403 ]; then
    echo 'Article deployment verified; unauthenticated access remains denied.'
    exit 0
  fi
  attempt=$((attempt + 1))
  sleep 1
done
echo 'Article health or access check failed' >&2
exit 1
