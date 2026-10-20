# Versioned operations deployment

The existing root release worker now deploys a fixed operations bundle with the
application release. It first verifies that the exact commit passed the master
CI and is still master. It downloads only the source paths compiled into
`ops_release.FILES` from GitHub at that immutable SHA, checks complete bounded
responses, compiles the files, runs health/news unit tests and imports the worker
as the unprivileged scheduler account without production credentials. SHA-256
checksums are retained in the version's manifest. The CI release receipt is
successful only if `opsCommit` equals the requested application commit.

Managed entry points are the health dispatcher, news dispatcher and release
worker. The worker's `release_contract.py`, `backup_database.py` and
`ops_release.py` are version-local dependencies. Backup services, restricted SSH
receivers, credentials, systemd units and application configuration are not
updated by this bundle. Extending these boundaries requires an explicit change.

Under the maintenance lock and both scheduler locks, one atomic `current`
symlink replacement activates the complete bundle. Running workers retain their
already-imported code; schedulers cannot run during the switch. Application
failure restores the previous operations pointer and the previous application.
An unsuccessful rollback leaves maintenance enabled for inspection. Version
files are retained; repeating the same version preserves the prior rollback
pointer. No uploaded executable, command or path is accepted over SSH.

## One-time bootstrap

Stage reviewed files and tests in a root-owned directory. Keep the `ops_release`
FILES layout (news `dispatch.py` and `test_dispatch.py` beside the Volc files).
Run `python3 bootstrap_ops.py --source <staging-directory>` as root. It refuses
existing `/opt/stock/ops` and unexpected targets, takes all three locks, snapshots
the installed scripts, installs fixed entry-point symlinks and activates only
the new worker/updater. Health/news remain their installed versions until the
next verified master release. If busy, wait for the current service to finish;
never remove its lock file. Preserve the staging directory and bootstrap output.

## Verify / rollback

Check `/srv/stock/deploy-status/<release-id>.json` for `state: deployed`,
`commit` and matching `opsCommit`. Check `/opt/stock/ops/current/manifest.json`
and all file hashes; verify health/news timer results and the external health
workflow. Inspect `/opt/stock/ops/previous` for the retained version.

For a manual operations-only rollback, stop the release timer, wait for the
release service to become inactive, take `/run/lock/stock-maintenance.lock`, then
use `ops_release.transaction(Path('/opt/stock/ops/previous').resolve())` as a
context manager. It acquires both scheduler locks and atomically activates that
validated version. Inspect results before restarting the release timer. This
changes code only: never restore old scheduler state or credentials. A complete
application rollback additionally uses the release history's `previous.env` and
its corresponding operations version; do not mix unreviewed versions.
