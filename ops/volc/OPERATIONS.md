# mufengtongxue 运维入口

当前为隔离迁移演练。生产启用前，以迁移执行记录中的验证结果为准。

## 位置和管理方式

| 内容 | 新机位置/入口 |
| --- | --- |
| 容器管理 | Docker Compose；无需Docker管理面板 |
| 发布定义与固定镜像清单 | `/opt/stock/deploy`，`release.env`不含密码 |
| 后端运行配置 | `/etc/stock/runtime.env`，仅root与容器运行用户可读 |
| 数据库 | 独立Compose项目；数据固定在`/srv/stock/mysql` |
| 新闻feed | `/srv/stock/news`，后端只读挂载 |
| 后端可查询日志 | `/srv/stock/logs`；保留旧日志快照，并按大小轮转新日志 |
| 本地数据库备份 | `/srv/stock/backups/daily`；最近两份成功快照 |
| 迁移恢复材料 | `/srv/stock/backups/rehearsal-20261014`；原SQL、校验报告及8.0冷备 |
| IP入口与TLS | 宿主机Nginx；`stock-certbot-renew.timer`每4小时检查 |

数据放在宿主机目录，不随应用容器重建消失。MySQL和独立博客各用自己的Compose项目，应用发布只更新指定服务。

## 查看运行状态

```bash
cd /opt/stock/deploy
docker compose --env-file release.env -f compose.app.yaml ps
docker compose --env-file release.env -f compose.database.yaml ps
docker compose --env-file release.env -f compose.blog.yaml ps
docker compose --env-file release.env -f compose.app.yaml logs --tail 100 back
systemctl status stock-certbot-renew.timer
journalctl -u stock-certbot-renew.service --since today
df -h /
```

数据库维护通过容器内客户端读取受限配置文件；公网3306不开放。数据库账号不再和旧机共用，应用账号仅有stock库的数据读写权限。

## 演练与正式运行

演练固定关闭定时采集、任务恢复、新闻采集和Tushare请求。备份及测试库刷新systemd单元还要求`/etc/stock/production.enabled`存在；迁移过程中不创建该标记、不启用这些定时器。最终一致性同步及旧端停写之后，才能在明确切换步骤中开启新端任务。

IP入口的维护标记是`/srv/stock/state/maintenance`。数据和业务验收前保持该标记；应用就绪检查成功只代表进程可响应，不能代替业务验证。

## 发版与回退

GitHub先测试和构建，再部署同一份已核验镜像。当前大文件使用本机SSH中转；GitHub runner直接SSH传大镜像的速度实测不够好，手动试验入口不等于正式CD已完成。

用户已确认继续使用现有阿里云ACR镜像仓库进行分发，应用和数据库仍运行在火山ECS。GitHub构建并测试镜像，推送候选标签到现有仓库，新机拉取并按摘要核验后部署；不新增火山CR月租。镜像仓库仅用于发版，业务请求和数据库访问不经过阿里云。

`volc-registry.yml`恢复为迁移分支专用的手动入口，仍只发布已通过CI的同一批候选镜像，不改变旧生产标签或旧服务。当前候选镜像已发布并核验，无需重复推送。正式CD触发、受限发布凭据与回退演练尚待完成，不能把候选发布成功当作生产CD完成。新机已加载的固定镜像不依赖仓库持续在线。

异机备份优先评估火山TOS，域名与DNS按备案和切换计划迁入火山；这些尚未完成，不能当作当前已启用能力。

发布清单分别记录应用commit、镜像ID和运维定义版本。Docker29导入旧格式镜像归档时，manifest ID可能变化；必须验证归档SHA256及config.digest后，记录服务器实际固定ID。

MySQL引擎升级和数据库DDL不属于普通应用发版。备份及后续发布/迁移统一使用`/run/lock/stock-maintenance.lock`互斥。MySQL升级前保留字节对比通过的8.0冷备压缩包，原始5.7 SQL同时保留在新机和操作机。

冷备回退仅适用于尚未接收新业务写入的演练，或已经明确恢复点的恢复操作。开始接收新写入后，直接恢复旧冷备会丢失之后的数据；应先保全最新状态并制定同步方案。

## 备份与待收尾事项

`backup_database.py`使用single-transaction生成stock一致性备份，校验gzip和SHA256后才登记成功、轮转较旧快照；空间不足时保留已有备份并报错。恢复验证另行执行，不能只凭压缩包校验宣称可恢复。

自动异机备份、告警接收渠道、正式CD发布/回退演练及域名接入备案尚需收尾。本地备份和binlog都位于同一块40G磁盘，不能代替异机备份。临时迁移SSH授权在迁移完成后移除。

## 本次演练验收与调度准备（2026-10-14）

生产快照53张表、10,854,411行已在8.0恢复，并升级至8.4.11；逐表行数、CHECKSUM及列定义一致，28条迁移历史保持不变。升级前冷备已与停止状态的数据目录逐字节比较。原始SQL完成SHA256/gzip校验，不能把这份04:19的演练快照当作切换时的最新生产数据。

应用23项API检查已通过，包括注册/登录/退出、权限、股票/行情/新闻、后台日志、文章鉴权、笔记冲突及图片往返。HTTPS IP浏览器完成首页、非空行情、登录、刷新保持会话及退出；验收用临时账号和维护通行入口已清理，普通公网请求恢复503。手机视口验收仍待完成。

备份、测试库刷新和新闻dispatch的systemd单元已安装但未启用。测试库另有`/opt/stock-test/PAUSED`保护；新闻dispatch还要求`/etc/stock/news-delivery-ready`，只有GitHub采集投递目标验证为新机后才可创建。新机dispatch使用`--feeds /srv/stock/news`；独立服务用户通过目录/文件ACL仅读取feed，不加入后端凭据所在组。后续原子替换feed时需保留此读取ACL。旧服务与任务保持运行。

### Backup failure detection

`stock-backup-health.timer` checks every 15 minutes after cutover; keep it disabled
while `/etc/stock/production.enabled` is absent. It checks the latest completed
archive's metadata and size, a 36-hour freshness limit, abandoned partial dumps,
the backup service result, the enabled backup timer, and an 8 GiB free-space reserve.
The check does not rehash 1+ GiB every 15 minutes; backup creation/restore validation
provides that proof. A failure returns nonzero, appears in the systemd journal, and
writes a private `/srv/stock/state/backup-health.json` for the migration monitor.
`backup_health.py --audit` evaluates the same conditions without changing status.
This is local failure detection; an enduring external notification destination and
recurring off-host backup still need to be configured before final acceptance.

The rehearsal application CI runs for application/runtime/topology changes. Python
operations-only changes use `volc-ops.yml`, so they do not rebuild unchanged images.
Manual ACR publication must still identify a successful full application CI run and
its exact SHA; an operations check is not sufficient evidence to publish an image.

### News cutover candidate

`volc-news.yml` preserves Sina/Bloomberg collection, original delivery before CPU
translation, the Argos model/cache, and a separate translated delivery. Its default
is validation only. Production publish requires both master and the server-owned
`/etc/stock-news-delivery.enabled` flag. No root password, uploaded executable,
arbitrary SSH command or database credential is given to the runner.

`stock-news-wakeup.timer` checks the two delivered files every minute. The local
root-owned controller validates each changed file and resets only that source's
`next_attempt`/failure counter through the existing app DB permissions. It requires
both cutover flags and `NEWS_SYNC_ENABLED=true`; unchanged files are ignored and
failed DB updates remain pending for retry. A translated file with the same source
generation time but changed content wakes the source again. The reader and SSH
receiver use the same file lock. New services/timers remain disabled in rehearsal.

At the approved cutover, replace the legacy `bloomberg-news.yml` delivery steps with
this verified candidate, keeping its existing workflow filename because the server
dispatcher targets that filename. Retain its hourly fallback schedule only after
old server dispatch has stopped. Do not add a second scheduled collector. Retire
this validation candidate's migration-branch push trigger after integration. The
existing production workflow remains unchanged until this handover is approved.

### Explicit writer handover

The base `compose.app.yaml` always disables every writer. Production requires the
additional `-f compose.production.yaml`; it enables normal scheduled collection,
news, admin jobs and Tushare, while keeping `SYNC_ON_STARTUP=false` to prevent a
restart from launching an unsolicited bulk import. Validate resolved topology with
`check_stack.py --env-file release.env --production`. Validation does not start any
container or grant cutover authorization. Merely creating `production.enabled`
does not enable application writers; merely adding the override does not enable
systemd timers. The approved cutover must handle both explicitly, after old writers
are stopped and final data checks pass. This override has not been applied yet.


## 受限正式发布候选（切换前禁用）

`volc-registry.yml`从完整CI成功run取回同批测试镜像，推到既有ACR并生成固定摘要清单；默认仅通过SSH校验请求，不部署。`queue_release=true`只允许master，并要求服务器同时存在`/etc/stock/production.enabled`和`/srv/stock/state/cd.enabled`。切换前不要创建标记或启用`stock-release.timer`；默认分支旧CI还需单独替换，不能直接合并触发旧机发布。

现有stock-deploy密钥由root持有的分派器限定为镜像/新闻/发布数据入口，没有shell或Docker权限。发布请求大小上限16KiB，只允许固定ACR两个仓库的SHA256摘要；最多两项待处理。临时仓库认证仅在`/run/stock-cd`内存文件系统，持久化记录和状态响应不包含凭据。重启丢失待处理请求时应人工核对状态，不自动补发。

root worker复核GitHub完整CI的commit、分支、仓库及成功状态，检查近期备份和恢复证明，拉取并核对镜像ID；候选迁移列表与现库历史必须相同。仅更新back/front、关闭入口后检查健康，失败恢复previous.env及应用版本；失败回退仍异常时保留维护模式。此入口不执行DDL、不恢复数据库。已有版本重复提交返回already-current，不重启服务。代码中的业务变更仍需要正常review；摘要与image-id来源依赖受保护的GitHub CI上传凭据。

`release_worker.py --rehearsal /run/stock-cd/request.json`默认只预检，要求新机维护且无生产标记；`--apply`才会尝试隔离新机应用更新。正式队列只能由root预装的systemd服务处理，不运行上传脚本。worker与备份、同步共用维护锁；状态位于`/srv/stock/deploy-status`，发布前后清单位于`/opt/stock/deploy/releases/cd-*`。单次请求失败应检查回退结果，不自动重复提交。


## 最终同步工具（需要用户先确认停写窗口）

- `final_export.py`仅适用于旧5.7主机，默认只读预检。显式`--export --window-id YYYYMMDDTHHMMSSZ`要求root持有600权限的`/root/stock-cutover-approved.json`，字段包含对应windowId、oldHost/newHost、stopWritesApproved=true和未来不超过两小时的expiresAtEpoch。授权文件只能在用户明确确认窗口后建立，文件本身不替代用户授权。
- 工具不自动停止服务或设置只读；导出前要求旧stock-back停止、旧新闻service/timer停止、无活跃InnoDB事务、read_only和super_read_only同时开启，以及至少8GiB空间。执行前应记录原开关/定时器/容器状态并检查没有进行中的旧发布或新闻工作流。持有旧发布锁，主库与测试库分别导出，精确计数、内容checksum、列、索引、外键、排序规则及迁移历史入清单，禁止跨库外键/存储对象未经评审直接迁移。
- `final_transfer.py`默认只显示计划。`--transfer`读取同窗口最终导出清单，复用已验证raw基线做rsync差分：旧机→Mac128KiB/s、Mac→新机2MiB/s。保留原本机基线和新的独立最终SQL；目标先验证原预置SHA，再仅将预置raw文件重命名到本窗口目录，避免额外占用4.45GB；in-place传输中间文件不可恢复数据库。仅两份SQL在本机和新机完整SHA通过后写transport-verification.json。
- `final_import.py --window-id ...`默认只检验最终清单/传输证明及SQL计数和SHA。`--apply`还要求新机同窗口root批准文件、维护状态、后端已停、无生产标记和至少4GiB余量。仅替换新机演练stock及stock_test，逐库核验内容/结构；不修改旧库、不启动后端、不启用采集、不改DNS。失败保留SQL及当前失败库供诊断，不自动覆盖重试；任何已存在导出/传输/导入目录都需按记录人工判断，不能换窗口名来绕过失败。
- 停写期间旧数据库必须持续只读。完成所有数据/应用验证前不开放新端；任何恢复旧写入的回滚都会使本次最终快照失效，之后必须使用新批准窗口重新导出。新机开始真实写入后禁止直接切回旧库。

### MySQL 5.7 到8.4的排序规则保全

实测发现仅设置collation-server=utf8mb4_general_ci不足以保留旧mysqldump建表默认值。5.7导出的DEFAULT CHARSET=utf8mb4在8.4会采用default_collation_for_utf8mb4=0900_ai_ci；原演练主库118列、测试库89列存在此差异。最终导入会话显式设为utf8mb4_general_ci，并核验每表/每列排序规则；不将general_ci与0900_ai_ci当作可忽略差异。

独立schema-only探针已验证53+33张表、433+330列按此方式与旧库列定义一致，无业务行导入，探针空库已删除。现有演练库未为此重复恢复，最终导入前仍不能宣称它与5.7源库排序规则一致。版本间只归一化整数显示宽度、DEFAULT_GENERATED展示标记及utf8→utf8mb3命名，其他默认值、可空性、排序规则差异均阻断。后续新迁移DDL须显式声明预期排序规则；本导入会话设置不改变全局数据库变量。

发布接收器以stock-deploy运行，不能遍历保存密码的/etc/stock。它仅检查/srv/stock/state/cd.enabled这个root控制的公开标记；root worker再次同时检查两个开关。不要通过放宽/etc/stock权限使CI账户可读运行凭据。停止生产发布时移除公开cd标记，保证新请求立即拒绝。


## 内容镜像与站外健康检查候选

应用发布可携带现有stock-blog仓库的文章固定摘要和测试image-id；字段缺一或任意其他仓库均拒绝。健康检查包含文章匿名403，失败恢复前一份完整release.env（含ARTICLE_IMAGE），不动数据库。完整CI的文章任务还验证有权限的内容访问、图片/搜索数据权限和后端故障拒绝访问。

stock-health-snapshot.service生成root:root/644的固定无凭据摘要，供受限SSH的`health status`读取；此账号仍无shell、Docker或备份读取权限。snapshot timer候选保持disabled。check_remote_health.py默认只验证隔离状态；--production要求正常入口、DB/backend healthy、有效本地备份和持续异机证明。当前recurringOffhostVerified固定false，等用户指定长期存储再接证明，不能手改true假装已完成。

volc-health.yml失败走GitHub现有工作流通知设置；没有配置新收件人或声称邮件已送达。执行旧机停写和默认分支接管前须核对上述状态。
