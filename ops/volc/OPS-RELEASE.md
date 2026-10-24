# Versioned operations deployment

The existing root release worker now deploys a fixed operations bundle with the
application release. It first verifies that the exact commit passed the master
CI and is still master. It downloads only the source paths compiled into
`ops_release.FILES` through the GitHub Contents API at that immutable SHA (avoiding the unreliable raw-content route), verifies each Git blob hash and complete bounded
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
# 按模块发布

`volc-rehearsal.yml` 先生成 `stock-volc-plan-<commit>`：前端、后端、文章分别比较
Git 源码树、公共依赖与构建配置、Dockerfile 和对应 CI 构建/检查步骤。
从最近 300 个 Actions artifact 中寻找可用的、小于 64 KiB 的镜像发布凭据；
校验所属仓库、master、发布 workflow、成功的源码 CI、祖先关系及不可变镜像身份。
找不到有效匹配、凭据过期或输入变化时，重新构建对应模块，不猜测镜像 tag。

- 只改前端：运行前端完整 lint、行为、构建、浏览器和镜像检查，只上传/发布前端。
- 文章或图片变化：运行文章元数据、全站构建、授权路由、分层及镜像检查，发布文章。
- 公共依赖变化：三模块重新检查、构建、发布；Dockerfile/构建步骤变化影响对应模块。
- 仅发布脚本变化：运行当前公共安全/契约/运维检查，复用已通过 CI 的应用镜像。

当前提交必须通过 CI 才能发布。未变模块复用固定 registry digest 和测试过的 image ID，
不下载旧镜像归档、不重新推送。小型 `modules.json` 凭据保留原始源码提交和 CI run，
后续发布可继续验证来源；旧格式凭据也会先核验源码 CI，再转换。
凭据保留 30 天；超期无可用凭据时安全地重新构建。

服务器仍执行备份/恢复证明、磁盘余量、镜像身份、数据库兼容性、当前 master、
维护锁、全服务健康与文章鉴权检查。已有镜像本地校验后复用，仅拉取本地缺失的 digest。
仅镜像变化的服务执行 Compose 更新，失败按实际变化的服务回退，同时回退运维版本。
发布状态的 `changedServices` 记录实际更新范围。
更新整个发布版本的 `RELEASE_SHA` 不会单独触发未变化后端容器重建；容器中的值仍对应
它上次实际启动的发布，整体版本以部署状态和 `deployment.json` 的 commit 为准。

如需刷新未变模块的基础镜像，手动运行 isolated rehearsal 并勾选 `force_rebuild`。
这会执行全量检查和重建，不绕过任何生产发布门禁。
