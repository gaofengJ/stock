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

新环境不依赖阿里云镜像仓库。曾用于连通性验证的ACR候选镜像发布工作流已移除；旧生产工作流和旧镜像保留到切换完成，避免影响旧服务。当前使用已校验的镜像归档导入火山ECS，运行时固定本地镜像ID，不要求ECS连接Docker Hub。

若后续采用托管仓库，选择上海火山CR并使用同地域内网拉取。2026-10-14官方标价：小微版50元/月或0.08元/小时，存储与公网流量按对应计费规则另计；实际优惠以购买页为准。目前未开通或购买。费用来源：https://docs.volcengine.com/docs/cr/instance?lang=zh 。异机备份优先评估火山TOS，域名与DNS按备案和切换计划迁入火山；这些尚未完成，不能当作当前已启用能力。

发布清单分别记录应用commit、镜像ID和运维定义版本。Docker29导入旧格式镜像归档时，manifest ID可能变化；必须验证归档SHA256及config.digest后，记录服务器实际固定ID。

MySQL引擎升级和数据库DDL不属于普通应用发版。备份及后续发布/迁移统一使用`/run/lock/stock-maintenance.lock`互斥。MySQL升级前保留字节对比通过的8.0冷备压缩包，原始5.7 SQL同时保留在新机和操作机。

冷备回退仅适用于尚未接收新业务写入的演练，或已经明确恢复点的恢复操作。开始接收新写入后，直接恢复旧冷备会丢失之后的数据；应先保全最新状态并制定同步方案。

## 备份与待收尾事项

`backup_database.py`使用single-transaction生成stock一致性备份，校验gzip和SHA256后才登记成功、轮转较旧快照；空间不足时保留已有备份并报错。恢复验证另行执行，不能只凭压缩包校验宣称可恢复。

自动异机备份、告警接收渠道、正式CD发布/回退演练及域名接入备案尚需收尾。本地备份和binlog都位于同一块40G磁盘，不能代替异机备份。临时迁移SSH授权在迁移完成后移除。
