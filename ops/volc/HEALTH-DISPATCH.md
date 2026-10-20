# Health check fallback and release lock handling

GitHub `volc-health.yml` keeps its original cron schedule. A separate
`stock-health-dispatch.timer` checks every five minutes whether master has
received a health run within 20 minutes. If not, and no run is active, it sends
`workflow_dispatch` for that workflow only. It never queues an application release.

The service reuses the existing repository-scoped Actions credential in
`/etc/stock-news-dispatch.env`, under the existing `stock-news-dispatch` account.
Its private state is `/var/lib/stock-health-dispatch/status.json`; it does not
change the news scheduler's code or state. The state records last-run age,
last completed result, POST intent and backoff. A failed health check is retained
as a failure, not treated as proof that the host is healthy.

Before POST, intent is written atomically. Uncertain responses are reconciled
against later manual runs and held for 20 minutes before another attempt.
Definitive API failures use bounded 5–30 minute backoff. Active runs are never
cancelled by this service; an active run older than 20 minutes is reported as
`blocked_stale_active`. A successful manual run confirms the execution path,
not the reliability of GitHub cron.

This is host-assisted scheduling, not independent monitoring: when this host
is down, it cannot trigger the fallback. GitHub cron remains a separate trigger;
neither mechanism provides a strict uptime-detection guarantee.

## Install / verify

Back up the installed worker and any existing fallback units before replacement.
Deploy `health_dispatch.py` to `/opt/stock/deploy/` and the service/timer to
`/etc/systemd/system/`. The credential file is used by systemd and must never be
copied into deployment reports. Validate units with `systemd-analyze verify`,
run the Python tests, then `systemctl daemon-reload` and
`systemctl enable --now stock-health-dispatch.timer`.
Starting the oneshot service is safe; fresh/active runs are skipped.

For acceptance, verify `status.json`, the resulting GitHub run and its actual
HTTPS/SSH health result. Repeating the service while that run is active or recent
must not create another run.

The release worker catches only `BlockingIOError` from acquisition of
`stock-maintenance.lock`, emits `deferred-maintenance-lock`, and returns success.
It leaves queue/claimed files untouched. Other lock errors still fail. Verify
with an actual held lock, then verify the next unlocked timer invocation.

## Rollback

Disable and stop `stock-health-dispatch.timer`, then stop its oneshot service.
Restore the backed-up service/timer files (or remove only the newly installed
ones), and reload systemd. Preserve its state for diagnosis. Restore the prior
release worker under `stock-maintenance.lock`; do not interrupt a running release.
The original GitHub health cron and the existing news scheduler remain unchanged.

Tests: `python3 -B -m unittest discover -s ops/volc -p 'test_health_dispatch.py'`
and `python3 -B -m unittest discover -s ops/volc -p 'test_release*.py'`.
