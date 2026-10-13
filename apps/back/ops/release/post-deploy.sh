#!/usr/bin/env bash
# Sourced only while holding stock-back-release.lock. Every step is retryable.
complete_release() {
  local run=$1 package=$2 image=$3 runtime=$4
  if [[ ! -f "$run/post-enqueued" ]]; then
    docker run --rm --add-host host.docker.internal:172.17.0.1 --mount "type=bind,src=$runtime,dst=/run/stock/runtime.env,readonly" -e APP_ENV_FILE=/run/stock/runtime.env "$image" node ops/release/database.cjs enqueue-market > "$run/backfill.json"
    touch "$run/post-enqueued"
  fi
  if [[ "$(cat "$run/refresh-paused-by-release")" == 1 ]]; then
    rm -f /opt/stock-test/PAUSED
    printf '0\n' > "$run/refresh-paused-by-release"
  fi
  install -d -m 700 "$ROOT/tools" "$ROOT/backups"
  for tool in backup.sh daily-backup.sh maintenance.py; do
    install -m 700 "$package/release/$tool" "$ROOT/tools/$tool"
  done
  install -m 644 "$package/release/stock-release-backup.service" /etc/systemd/system/stock-release-backup.service
  install -m 644 "$package/release/stock-release-backup.timer" /etc/systemd/system/stock-release-backup.timer
  systemctl daemon-reload
  systemctl enable --now stock-release-backup.timer
  systemctl is-active --quiet stock-release-backup.timer
  printf 'success\n' > "$run/phase"
  python3 "$ROOT/tools/maintenance.py" --root "$ROOT" --apply > "$run/retention.json" || echo 'Release maintenance deferred; inspect retention logs'
}
