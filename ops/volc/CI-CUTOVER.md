# 默认分支 CI 接管清单

2026-10-15 切换状态：用户已批准停写和切换，PR #73 已接管 master，旧端保持冻结，新端正式开放。下方候选验证章节保留历史记录，以本节运行状态为准。任何后续数据库恢复仍须单独评估新写入，不能直接回旧库。

| 现有入口 | 当前作用 | 切换时处理 |
| --- | --- | --- |
| back-cd.yml、front-cd.yml | 旧主机应用发布与旧运行环境验证 | 由volc-rehearsal完整CI和volc-registry固定产物发布接管；保留凭据模板、发布产物、IndexNow、历史行情、前端轮询等有效测试 |
| bloomberg-news.yml | 旧主机原文/译文投递，整点兜底 | 替换为已验证volc-news实现，保留原文件名以兼容dispatcher；master且生产开关开启才publish，其余validate |
| news-scheduler.yml | 通过旧root SSH安装/操作新闻调度 | 停用旧管理入口，使用新机已安装的systemd调度；停止旧dispatch及确认进行中的GitHub新闻任务结束后再启新端 |
| blog-cd.yml | 股票文章构建及旧主机更新 | 改由完整CI的articles job构建、鉴权测试、同批固定摘要发布；独立老博客仍保留已迁移镜像 |
| market-maintenance.yml | 旧库刷新、状态查询 | 改为新机独立stock_test权限及已准备的刷新服务；保持PAUSED直到明确需要刷新，不用生产库覆盖独立测试数据 |
| intraday-history.yml | 历史补采到旧库 | 切换后仅使用新机受控作业及现有业务参数；不保留旧root SSH远程任意脚本入口 |
| release-maintenance.yml、blog-release-status.yml | 旧主机维护/清理/状态 | 替换为新机固定受限运维或管理员SSH操作；不复用旧镜像/目录清理命令 |

顺序：

1. 保存默认分支SHA及所有运行中workflow，确认没有进行中的旧发布。不要通过修改旧SSH_HOST来“重定向”旧部署脚本。
2. 在同一受控提交里撤下旧主机有写入能力的入口，并为新完整CI增加master/PR触发。迁移分支当前只增加验证，不改默认分支。
3. 新发布默认保持手动、queue_release=false；完整CI通过后可运行ACR→受限SSH validate。只有最终数据和业务验收、旧端停写、用户确认切换都满足时才启用服务器production/cd标记与release timer。
4. 自动生产发布如需启用，应仅由master成功的完整CI触发，复用该run的产物，不能重新构建、从PR传入任意SHA或放宽受限SSH。当前自动触发尚未接通。
5. 新闻工作流保留bloomberg-news.yml文件名，并明确server dispatch和GitHub兜底只投新机；避免两个主机同时唤醒写库。
6. 不要在回滚材料、独立运维入口和长期备份尚未验证前删除旧凭据；旧凭据最终从GitHub移除与临时迁移密钥清理一起验收。

已完成的候选验证：44项运维测试；新增保留的旧合同测试与前端轮询门禁；GitHub→ACR→受限SSH链38547570937只校验通过。正式默认分支接管和生产启用仍待完成，不能据此宣称默认分支已接管。


## 可审查候选（尚未安装）

`python3 ops/volc/prepare_ci_cutover.py --output <新建审查目录>`生成11个候选工作流及SHA256清单，不写`.github`、不改默认分支、不执行SSH。源工作流意外变化时转换失败，现有输出目录拒绝覆盖。

- 完整CI保持原workflow名称/路径，增加master push/PR与全部运维门禁；不使用路径过滤漏掉需要发布的提交。
- `volc-registry.yml`候选接收同仓库master **push** 的成功完整CI事件，读取同run的不可变构建产物，不重构建；需要仓库变量`VOLC_PRODUCTION_ENABLED=true`才自动入队。手动validate仍可运行。PR事件不能进入有凭据的自动发布。
- 队列前核验当前master SHA；root worker在拉取前及实际变更前再次核验，旧CI迟到时拒绝部署。实际运行仍需服务器私有production与root控制的公共cd标记，不以仓库变量替代服务器开关。
- 新闻继续使用`bloomberg-news.yml`兼容既有dispatcher，保留deliver/dispatch_id，整点兜底和手动投递均受仓库变量/服务器标记约束。旧dispatch停止后才启新端。
- 八个旧root SSH管理/发布入口变为仅手动、明确失败并指向本文的退役入口，没有默认分支推送触发。需要历史补采、测试库刷新或版本清理时由管理员用新机受控命令执行，不能恢复旧任意脚本投递。
- **候选不能直接安装**：articles构建/鉴权及三产物分发已通过38554242674/38554733508；停写确认、最终数据验收、本地备份启用及告警接收准备仍待完成。用户已明确延期长期异机备份，不再作为本次切换前置条件。独立老博客无本仓库构建入口，保留现有内容镜像，后续有内容源时单独接入。

当前1f312ca6完整应用CI38551884104已成功（contracts/frontend/verify全部通过），当前新机仍运行bfd23afd。候选生成不等于新版本发布。


## 文章构建和站外检查

完整CI新增articles job，以Node24构建apps/blog、执行内容检查，并在真实Nginx上验证正文/JS/搜索索引/图片对匿名、越权、过期试用、授权用户及后端故障的行为。镜像默认403，部署挂载已验证的ops/volc/blog.nginx.conf；既有stock-blog仓库接收volc-SHA标签，registry复用同一CI产物及image-id，不重构建、不写latest。release worker可选接收完整articleDigest/articleImageId对，更新ARTICLE_IMAGE，与back/front一起健康检查及失败回退；旧演练请求保留原文章镜像。

`volc-health.yml`使用既有受限SSH，只允许读取root生成的固定health.json；不读取数据库行、备份内容、环境变量或服务器日志。root每5分钟候选快照timer保持禁用；已单次运行并从本机验证当前维护状态。生产时GitHub每15分钟检查HTTPS、主机健康、备份状态、报告时效和长期异机证明；现阶段异机字段明确false，不能把历史一次副本误报为持续备份。GitHub工作流失败会标红，邮件/移动通知由用户GitHub设置决定，目前未验证通知收件。

切换时需启用stock-health-snapshot.timer并先生成新报告，然后开启仓库生产变量。2026-10-14用户明确本次暂不配置长期异机备份，后续需要时单独接个人电脑；因此候选健康工作流显式使用`--offhost-policy deferred`，缺少持续异机副本显示warning，不阻断本次切换。原始`recurringOffhostVerified=false`保留，本地备份、运行健康和报告时效检查仍必须通过；未传此选项的检查默认仍要求异机证明。此检查不是新的付费云资源。

## 2026-10-15 正式运行补充

- 主库与独立测试库最终迁移及业务验证完成；新端生产、发布、新闻、本地备份和健康 timer 已启用，仓库 `VOLC_PRODUCTION_ENABLED=true`。域名仍待接入备案，先使用新 IP HTTPS。持续异机备份按用户决定延期，邮件收件未验证。
- GitHub 返回旧的 2026-10-12 queued 新闻 run，但取消和强制取消均报告已结束。新机 `/etc/stock-news-dispatch.env` 显式设置 `NEWS_DISPATCH_NOT_BEFORE=2026-10-14T16:04:00Z`，仅忽略切换前旧 run。默认不设置则保留全部运行记录；新 run 及未知时间仍参与重复保护。不得用滚动时间阈值跳过当前运行。
- 原文和译文 receiver 使用 `stock-deploy`。既有 `.delivery.lock` 需要该用户读写 ACL，现有两个 feed 需要只读 ACL，目录需要新建文件的默认 ACL。安装后须实际验证锁与读取，再以真实生产投递确认 `published=true`，validate-only 不足以证明写权限。新文件由 receiver 原子替换，数据库不向 receiver 开放。
- 大文章镜像首次拉取允许 30 分钟，其他镜像 10 分钟，整体发布服务 60 分钟。拉取期间旧容器继续运行，只有校验通过才切换。当前 master 验证读取小型 Git ref 响应，避免拉取大提交详情中断。
- 旧 MySQL 5.7 导出必须显式使用 `--default-character-set=utf8mb4`。本次原始 SQL 的 31 行四字节字符修正已独立保留为 `four-byte-character-repair.sql`；恢复该原始生产 SQL 必须连同补丁执行。新的日常备份已完整使用 utf8mb4。跨版本原生 CHECKSUM 差异不能直接等同内容损坏，本次另外完成全字段逻辑 SHA 校验。
