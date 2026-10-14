# 默认分支 CI 接管清单

此清单是候选方案，迁移分支仍不得直接合入master；本文件不授权切换旧服务。

| 现有入口 | 当前作用 | 切换时处理 |
| --- | --- | --- |
| back-cd.yml、front-cd.yml | 旧主机应用发布与旧运行环境验证 | 由volc-rehearsal完整CI和volc-registry固定产物发布接管；保留凭据模板、发布产物、IndexNow、历史行情、前端轮询等有效测试 |
| bloomberg-news.yml | 旧主机原文/译文投递，整点兜底 | 替换为已验证volc-news实现，保留原文件名以兼容dispatcher；master且生产开关开启才publish，其余validate |
| news-scheduler.yml | 通过旧root SSH安装/操作新闻调度 | 停用旧管理入口，使用新机已安装的systemd调度；停止旧dispatch及确认进行中的GitHub新闻任务结束后再启新端 |
| blog-cd.yml | 两个内容站点镜像及旧主机更新 | 内容已迁移，正式的新内容发布入口仍待补齐；不能在旧路径尚未替换时自动合并/触发 |
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

已完成的候选验证：37项运维测试；新增保留的旧合同测试与前端轮询门禁；GitHub→ACR→受限SSH链38547570937只校验通过。正式自动CD、内容发布和维护入口替换仍待完成，不能据此宣称默认分支已接管。


## 可审查候选（尚未安装）

`python3 ops/volc/prepare_ci_cutover.py --output <新建审查目录>`生成10个候选工作流及SHA256清单，不写`.github`、不改默认分支、不执行SSH。源工作流意外变化时转换失败，现有输出目录拒绝覆盖。

- 完整CI保持原workflow名称/路径，增加master push/PR与全部运维门禁；不使用路径过滤漏掉需要发布的提交。
- `volc-registry.yml`候选接收同仓库master **push** 的成功完整CI事件，读取同run的不可变构建产物，不重构建；需要仓库变量`VOLC_PRODUCTION_ENABLED=true`才自动入队。手动validate仍可运行。PR事件不能进入有凭据的自动发布。
- 队列前核验当前master SHA；root worker在拉取前及实际变更前再次核验，旧CI迟到时拒绝部署。实际运行仍需服务器私有production与root控制的公共cd标记，不以仓库变量替代服务器开关。
- 新闻继续使用`bloomberg-news.yml`兼容既有dispatcher，保留deliver/dispatch_id，整点兜底和手动投递均受仓库变量/服务器标记约束。旧dispatch停止后才启新端。
- 七个旧root SSH管理/发布入口变为仅手动、明确失败并指向本文的退役入口，没有默认分支推送触发。需要历史补采、测试库刷新或版本清理时由管理员用新机受控命令执行，不能恢复旧任意脚本投递。
- **候选集尚不完整，不能直接安装**：`blog-cd.yml`内容构建/发布替换仍待完成；停写确认、最终验收、长期备份告警未齐备。生成manifest明确列出这些阻塞。独立老博客无本仓库构建入口，保留现有内容镜像，后续有内容源时单独接入。

当前1f312ca6完整应用CI38551884104已成功（contracts/frontend/verify全部通过），当前新机仍运行bfd23afd。候选生成不等于新版本发布。
