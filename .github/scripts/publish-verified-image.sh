#!/usr/bin/env bash
set -Eeuo pipefail

registry=registry.cn-hangzhou.aliyuncs.com
image=${IMAGE:-}
attempts=${PUBLISH_ATTEMPTS:-3}
push_timeout=${PUSH_TIMEOUT_SECONDS:-1200}
retry_delay=${PUBLISH_RETRY_DELAY_SECONDS:-15}

if [[ ! "$image" =~ ^registry\.cn-hangzhou\.aliyuncs\.com/mufengtongxue/stock-back:[a-f0-9]{40}$ ]]; then
  echo 'Expected the verified backend image with an immutable commit tag' >&2
  exit 2
fi
if [[ ! "$attempts" =~ ^[1-3]$ ]] || [[ ! "$push_timeout" =~ ^[0-9]+$ ]] || (( push_timeout < 1 || push_timeout > 1200 )) || [[ ! "$retry_delay" =~ ^[0-9]+$ ]] || (( retry_delay > 60 )); then
  echo 'Invalid publication retry limits' >&2
  exit 2
fi
if [[ -z "${DOCKER_USERNAME:-}" || -z "${DOCKER_PASSWORD:-}" ]]; then
  echo 'Registry credentials are required' >&2
  exit 2
fi

for (( attempt=1; attempt<=attempts; attempt++ )); do
  echo "Publishing verified image: attempt $attempt/$attempts"
  if printf '%s' "$DOCKER_PASSWORD" | timeout --kill-after=10 60 docker login "$registry" --username "$DOCKER_USERNAME" --password-stdin; then
    if timeout --kill-after=30 "$push_timeout" docker push "$image"; then
      exit 0
    fi
  fi
  if (( attempt < attempts )); then sleep "$retry_delay"; fi
done
echo 'Verified image publication failed after bounded retries' >&2
exit 1
