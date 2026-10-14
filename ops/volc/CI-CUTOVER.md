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

已完成的候选验证：30项运维测试；新增保留的旧合同测试与前端轮询门禁；GitHub→ACR→受限SSH链38547570937只校验通过。正式自动CD、内容发布和维护入口替换仍待完成，不能据此宣称默认分支已接管。
