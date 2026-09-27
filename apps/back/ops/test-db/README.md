# 服务器共享测试库

现有 MySQL 实例中的 `stock_test` 从生产库只读同步最近两个自然年，额外包含首日的前一交易日。保留范围外已有历史。用户、角色、权限和迁移记录不参与定期刷新。

## 本地使用

本机已生成被 Git 忽略的 `apps/back/.env.server-test`，使用仅有测试库权限的 `stock_test_app` 账号，连接池为 3。其他机器可复制 `.env.server-test.example`，单独填写测试账号配置。

账号的 5 个连接额度由所有实例共享，并非每个实例各有 5 个。后端默认在连接空闲 60 秒后回收连接（`DB_MAX_IDLE=0`、`DB_IDLE_TIMEOUT_MS=60000`），正常退出时也会关闭连接池。`DB_MAX_IDLE` 必须小于 `DB_CONNECTION_LIMIT` 才能启用当前 mysql2 版本的空闲回收。强制结束进程或断网时，退出钩子可能无法执行；若再次出现连接额度耗尽，应先检查该账号的连接列表及事务，仅清理已确认不再使用的旧连接。

在仓库根目录执行：

```powershell
pnpm -C apps/back start:test-db
```

后端默认端口仍为 3000，前端现有 `/api` 代理可以直接使用。新模式通过 `APP_ENV_FILE` 加载独立配置，不修改 `.env.development` 的旧连接配置。

前端使用 8187 等其他本地端口时，需要在 `.env.server-test` 的 `AUTH_ALLOWED_ORIGINS` 中显式加入对应来源并重启后端；模板已包含 8081 和 8187。仅改变前端端口而未调整此项，会使登录等写请求被安全校验拒绝。

更新代码后先核对数据库迁移。市场分析版本要求 `MarketAnalysis1790553600000`：缺少该迁移会导致任务调度报 `t_admin_job.mode` 字段不存在，且市场分析三张表不可用。测试库迁移使用 `pnpm -C apps/back migration:test-db`，不要误用生产配置。

`DB_SYNCHRONIZE=false`、`SYNC_ON_STARTUP=false`、`SYNC_SCHEDULE_ENABLED=false` 已设置。Tushare Token 默认留空：测试数据由服务器复制维护，普通联调不依赖 Tushare。手动测试抓取接口需要另行配置有权限的 Token，并暂停自动刷新。

需要迁移测试库时，先暂停刷新，构建后运行 `pnpm -C apps/back migration:test-db`。如果迁移改变行情表的字段列表，刷新程序会拒绝覆盖，保留已有测试数据；应先处理与生产源表的映射兼容问题。

## 服务器部署

- 文件：`/opt/stock-test/refresh.cjs`、`history-refresh.cjs`、`refresh.py`。
- 凭据：`/opt/stock-test/config.json`，root 专有目录和 600 文件权限。
- 账号：`stock_test_refresh`，生产库 SELECT、测试库读写权限，最多 3 个连接；本地开发账号最多 5 个连接。
- 调度：`/etc/cron.d/stock-test-refresh`，每 5 分钟检查一次。
- 状态：`/opt/stock-test/state.json`，保存每日期来源标识、剩余数量、保护和未完成原因；每批提交后落盘，可断点续跑。
- 日志：`/var/log/stock-test-refresh.log`，按 `/etc/logrotate.d/stock-test-refresh` 轮转。

程序借用已有 `stock-back` 容器内的 Node/mysql2 执行一次性任务，不修改镜像，不增加常驻服务。容器必须处于运行状态；发布期间失败会在下一轮重试。凭据通过 stdin 传递，不出现在命令行参数中。

有日线阶段记录时必须为 `success`，且日线、涨跌停行数与阶段计数一致。历史无阶段记录时只允许复制非空日线及非空事件；空事件日必须具有成功记录。只有生产具备8个指数、6个范围汇总以及成功阶段时才复制其市场发布状态，否则等待现有补齐任务计算。

每批最多3个交易日，优先最近日期，再补最早缺口。生产和测试共用各自应用的数据库写锁，每批释放；一次定时运行最多连续处理4分钟。使用同实例 `INSERT ... SELECT ... ON DUPLICATE KEY UPDATE`，数据不经过本地电脑，且始终排除生产自增ID。两库必须具有正确业务唯一键，否则拒绝同步；按日事务校验行数，失败回滚该日，重跑不会增加重复行。仅清理已验证源日期中被修订移除的旧键，不清空历史表或全局同步状态。小型参考快照单独原子替换。

生产、测试任一侧主动删除保护均跳过。原始数据变化撤销当日及下一交易日汇总，随后复制生产已完成汇总或交由现有补齐任务重算。`refresh.py` 强制使用两年合并模式，旧配置中的 `days=30` 不会再触发整表覆盖。更新时必须同时安装三个脚本。

复制批次之间至少让出6秒，覆盖生产执行器的5秒检查周期，避免复制连续抢锁使生产补齐或当天更新长期等待。历史规划只读取阶段清单，再按日期索引核对最多3日，不对千万行日线表反复扫描整个两年窗口；追平后轮流核对历史日期，发现绕过应用直接修改的数据。

刷新会覆盖测试行情改动。调试删除、导入、事务等写操作时，应先暂停；新版全部同步业务写接口共用互斥锁，但下一轮复制仍会覆盖已提交的测试改动。

## 运维命令（服务器上）

暂停并等待当前刷新完成：

```sh
touch /opt/stock-test/PAUSED
flock /var/lock/stock-test-refresh.lock true
```

恢复自动检查：

```sh
rm /opt/stock-test/PAUSED
```

立即恢复生产基准数据（先确保没有 PAUSED 文件）：

```sh
flock -n /var/lock/stock-test-refresh.lock python3 /opt/stock-test/refresh.py --force
```

暂停时 `--force` 也不会绕过暂停开关。`--force` 强制重新合并首批，后续批次仍按进度续跑；若需整个窗口重新核对，可在暂停后备份并移走 state.json 再恢复。不能绕过失败阶段、主动删除保护和唯一键校验。

## 与补齐任务配合

首次先复制生产已有原始数据，再提交缺失汇总任务，避免测试库对相同两年日线重复请求 Tushare。生产部署成功后会创建持久化两年任务；其完成的指数、汇总和阶段状态会随同增量复制。日常测试保持采集开关关闭，生产负责20:30等正常更新。测试库需要独立抓取时先暂停复制。
