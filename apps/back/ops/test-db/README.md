# 服务器共享测试库

现有 MySQL 实例中增加 `stock_test`，生产库只读。测试库保留最近 30 个交易日加 1 个前置交易日，以及交易日历、股票信息、游资名录。用户、角色、权限和迁移记录不参与定期刷新。

## 本地使用

本机已生成被 Git 忽略的 `apps/back/.env.server-test`，使用仅有测试库权限的 `stock_test_app` 账号，连接池为 3。其他机器可复制 `.env.server-test.example`，单独填写测试账号配置。

在仓库根目录执行：

```powershell
pnpm -C apps/back start:test-db
```

后端默认端口仍为 3000，前端现有 `/api` 代理可以直接使用。新模式通过 `APP_ENV_FILE` 加载独立配置，不修改 `.env.development` 的旧连接配置。

`DB_SYNCHRONIZE=false`、`SYNC_ON_STARTUP=false`、`SYNC_SCHEDULE_ENABLED=false` 已设置。Tushare Token 默认留空：测试数据由服务器复制维护，普通联调不依赖 Tushare。手动测试抓取接口需要另行配置有权限的 Token，并暂停自动刷新。

需要迁移测试库时，先暂停刷新，构建后运行 `pnpm -C apps/back migration:test-db`。如果迁移改变行情表的字段列表，刷新程序会拒绝覆盖，保留已有测试数据；应先处理与生产源表的映射兼容问题。

## 服务器部署

- 文件：`/opt/stock-test/refresh.cjs`、`refresh.py`。
- 凭据：`/opt/stock-test/config.json`，root 专有目录和 600 文件权限。
- 账号：`stock_test_refresh`，生产库 SELECT、测试库读写权限，最多 3 个连接；本地开发账号最多 5 个连接。
- 调度：`/etc/cron.d/stock-test-refresh`，每 5 分钟检查一次。
- 状态：`/opt/stock-test/state.json`，保存数据范围、条数与上一次来源标识。
- 日志：`/var/log/stock-test-refresh.log`，按 `/etc/logrotate.d/stock-test-refresh` 轮转。

程序借用已有 `stock-back` 容器内的 Node/mysql2 执行一次性任务，不修改镜像，不增加常驻服务。容器必须处于运行状态；发布期间失败会在下一轮重试。凭据通过 stdin 传递，不出现在命令行参数中。

生产存在 `t_sync_run` 时，仅接受最近行情日期的 `success` 状态。旧版没有该表时，要求日线、涨跌停、情绪表最新日期一致，并且两次定时检查的来源标识一致后才复制；这是兼容性就绪检查，不能代替新版生产任务的成功标记。

复制使用只读一致性快照，每批最多 1000 条，批次间暂停 20ms。按业务唯一键保留最新 ID，校验条数与日期完整性；复制期间来源变化时不发布。六张表通过一条 `RENAME TABLE` 一起切换，随后清理旧表和测试同步状态。只有来源标识变化才复制；生产原地修改同一行而未改变最大 ID 时，可使用强制刷新。

刷新会覆盖测试行情改动。调试删除、导入、事务等写操作时，应先暂停；普通 HTTP 写接口不全部持有同步互斥锁。

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

暂停时 `--force` 也不会绕过暂停开关。首次初始化允许 `--force` 跳过旧生产版本的两次稳定观测，但仍进行数据完整性与发布前的一致性检查。

## 本次生产边界

仅增加测试库、两个专用账号及刷新程序，没有修改生产数据或重启生产容器。服务器当前生产镜像仍使用原来的工作日 19:50 任务；仓库中每天北京时间 20:30 的修复尚未发布，需另外走正常部署流程。
