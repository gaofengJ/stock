#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
PACKAGE=$(cd "$(dirname "$0")" && pwd)
ROOT=/opt/stock-news/scheduler
TOKEN_FILE="$PACKAGE/credential.env"
BACKUP=''
APPLIED=0
SUCCEEDED=0
WAS_ENABLED=0
WAS_ACTIVE=0
[[ "$EUID" == 0 ]] || { echo 'Root is required to install the systemd timer'; exit 1; }
[[ -f "$TOKEN_FILE" && ! -L "$TOKEN_FILE" ]] || { echo 'Missing dedicated dispatch credential'; exit 1; }
cleanup() {
  result=$?
  trap - EXIT
  if [[ "$APPLIED" == 1 && "$SUCCEEDED" != 1 ]]; then
    echo 'Installation failed; restoring previous scheduler configuration'
    systemctl stop stock-news-dispatch.timer stock-news-dispatch.service || true
    for path in "$ROOT/dispatch.py" /etc/stock-news-dispatch.env /etc/systemd/system/stock-news-dispatch.service /etc/systemd/system/stock-news-dispatch.timer; do
      name=$(basename "$path")
      if [[ -f "$BACKUP/$name" ]]; then cp -p -- "$BACKUP/$name" "$path"; else rm -f -- "$path"; fi
    done
    systemctl daemon-reload || true
    if [[ "$WAS_ENABLED" == 1 ]]; then systemctl enable stock-news-dispatch.timer || true; else systemctl disable stock-news-dispatch.timer 2>/dev/null || true; fi
    if [[ "$WAS_ACTIVE" == 1 ]]; then systemctl start stock-news-dispatch.timer || true; fi
  fi
  rm -f -- "$TOKEN_FILE"
  if [[ -n "$BACKUP" ]]; then
    rm -f -- "$BACKUP/dispatch.py" "$BACKUP/stock-news-dispatch.env" "$BACKUP/stock-news-dispatch.service" "$BACKUP/stock-news-dispatch.timer"
    rmdir -- "$BACKUP"
  fi
  exit "$result"
}
trap cleanup EXIT
command -v systemctl >/dev/null
command -v python3 >/dev/null
python3 -B - "$TOKEN_FILE" <<'PY'
import os, re, sys
value = open(sys.argv[1]).read()
if not re.match(r'^NEWS_DISPATCH_TOKEN=[A-Za-z0-9_]{20,512}\n\Z', value):
    raise SystemExit('Invalid dispatch credential file')
os.chmod(sys.argv[1], 0o600)
PY
# Read-only authentication check happens before changing the running installation.
set -a
source "$TOKEN_FILE"
set +a
python3 -B "$PACKAGE/dispatch.py" --check-token
unset NEWS_DISPATCH_TOKEN
BACKUP=$(mktemp -d /opt/stock-news/.scheduler-backup.XXXXXXXX)
for path in "$ROOT/dispatch.py" /etc/stock-news-dispatch.env /etc/systemd/system/stock-news-dispatch.service /etc/systemd/system/stock-news-dispatch.timer; do
  if [[ -f "$path" ]]; then cp -p -- "$path" "$BACKUP/$(basename "$path")"; fi
done
if systemctl is-enabled --quiet stock-news-dispatch.timer 2>/dev/null; then WAS_ENABLED=1; fi
if systemctl is-active --quiet stock-news-dispatch.timer; then WAS_ACTIVE=1; fi
systemctl stop stock-news-dispatch.timer stock-news-dispatch.service 2>/dev/null || true
APPLIED=1
id stock-news-dispatch >/dev/null 2>&1 || useradd --system --home-dir "$ROOT" --shell /usr/sbin/nologin stock-news-dispatch
install -d -m 755 "$ROOT"
install -d -o stock-news-dispatch -g stock-news-dispatch -m 700 "$ROOT/state"
install -m 755 "$PACKAGE/dispatch.py" "$ROOT/dispatch.py"
install -o root -g root -m 600 "$TOKEN_FILE" /etc/stock-news-dispatch.env
install -m 644 "$PACKAGE/stock-news-dispatch.service" /etc/systemd/system/stock-news-dispatch.service
install -m 644 "$PACKAGE/stock-news-dispatch.timer" /etc/systemd/system/stock-news-dispatch.timer
systemctl daemon-reload
systemctl start stock-news-dispatch.service
systemctl enable --now stock-news-dispatch.timer
systemctl is-active --quiet stock-news-dispatch.timer
SUCCEEDED=1
python3 -B "$ROOT/dispatch.py" --inspect
systemctl list-timers stock-news-dispatch.timer --no-pager
echo 'News dispatcher installed and timer active'
