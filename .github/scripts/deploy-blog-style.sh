#!/usr/bin/env bash
set -Eeuo pipefail
[[ "${RELEASE_SHA:-}" =~ ^[a-f0-9]{40}$ ]] || { echo 'Invalid release SHA'; exit 1; }
PACKAGE="/opt/stock-blog-style/$RELEASE_SHA"
REGISTRY=registry.cn-hangzhou.aliyuncs.com/mufengtongxue/stock-blog
exec 9>/var/lock/stock-blog-style-release.lock
flock -n 9 || { echo 'Another article style release is running'; exit 1; }
cd "$PACKAGE"
tar -xzf blog-style.tgz
base=$(docker inspect --format '{{.Image}}' stock-blog)
docker image inspect "$base" > base-image.json
docker inspect stock-blog > previous-container.json
docker tag "$base" "stock-blog-rollback:${RELEASE_SHA:0:12}"
# Fail before touching the running container if any media changed or is missing.
docker run --rm --entrypoint sh -v "$PACKAGE/media.sha256:/tmp/media.sha256:ro" "$base" \
  -c 'cd /usr/share/nginx/html && sha256sum -c /tmp/media.sha256 >/dev/null'
echo 'Existing media hashes verified; no media needs uploading.'
docker tag "$base" "stock-blog-style-base:${RELEASE_SHA:0:12}"
printf 'FROM stock-blog-style-base:%s\nCOPY overlay/ /usr/share/nginx/html/\nLABEL stock.blog.release=%s\n' \
  "${RELEASE_SHA:0:12}" "$RELEASE_SHA" > Dockerfile
printf 'blog-style.tgz\nmedia.sha256\n*.json\n' > .dockerignore
docker build --pull=false -t "$REGISTRY:$RELEASE_SHA" .
# Verify Nginx and the new output before changing the live image tag.
docker run --rm "$REGISTRY:$RELEASE_SHA" nginx -t
printf '%s' "$DOCKER_PASSWORD" | docker login --username "$DOCKER_USERNAME" --password-stdin registry.cn-hangzhou.aliyuncs.com
docker push "$REGISTRY:$RELEASE_SHA"
docker tag "$REGISTRY:$RELEASE_SHA" "$REGISTRY:latest"
deploy_started=0
rollback() {
  code=$?
  trap - EXIT
  if [[ "$code" != 0 && "$deploy_started" == 1 ]]; then
    echo 'Article deployment failed; restoring the previous image.' >&2
    docker tag "$base" "$REGISTRY:latest"
    docker push "$REGISTRY:latest"
    (cd /home && sh stock-blog-deploy.sh) || true
  fi
  exit "$code"
}
trap rollback EXIT
docker push "$REGISTRY:latest"
deploy_started=1
cd /home
sh stock-blog-deploy.sh
[[ "$(docker inspect --format '{{.State.Running}}' stock-blog)" == true ]]
[[ "$(docker inspect --format '{{index .Config.Labels "stock.blog.release"}}' stock-blog)" == "$RELEASE_SHA" ]]
docker exec stock-blog nginx -t
echo "Article style release verified: $RELEASE_SHA"
