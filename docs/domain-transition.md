# 正式域名切换

正式行情入口为 https://stock.mufengtongxue.com。根域名和 www 跳转行情站，blog 子域名保留技术博客。备案号、域名 TLS、canonical、robots 和 sitemap 已由 #111 接入。

## 新链接与旧内容

图文资料包、Codex 提示与平台图片来源使用正式域名。公开稿及历史稿导出将两个旧公开 IP 的 http/https 链接映射到正式域名，保留路径、日期、数据版本与锚点；第三方网址、内部端口和图片数据不变。

`ops/volc/migrate_public_links.py` 默认只审计。管理员在生产主机用 `--apply` 修正当前复盘，先写入权限受限的 `/srv/stock/recovery/domain-links/*.json.gz`，再按原 revision 条件写新版本。并发编辑不覆盖，原历史版本不修改，重跑无重复变更。服务器记录恢复应以备份生成新版本，不能删除已有版本。

## 本机草稿

IP 普通网页保留完整请求路径跳转域名。`https://14.103.103.4/domain-transfer/` 和静态资源保持旧 origin，可下载 IndexedDB 复盘、localStorage 观察草稿、待收录素材、AI 输入与界面偏好。

在正式域名 `/domain-transfer/` 用原账号导入。只恢复本账号的数据，保留域名已有草稿与设置；恢复文件、IP 原草稿、服务器版本均不删除。文件可能包含私人记录，不包含会话 Cookie 或认证令牌，不上传服务器。复盘页保留恢复入口。登录 Cookie 不能跨 IP 与域名迁移，需要重新登录。

## 配置安装与验收

前端上线后运行 `ops/volc/install_domain_transition.py`。它先检查恢复页和活动 AI 任务，再备份 IP Nginx 与个人 AI 配置到 `/root/stock-domain-transition/`，将 AI origin 改为正式域名，仅重启该服务，配置失败时恢复。IP API 与内部服务、SSH 地址保持原值。

健康检查同时访问域名和服务器 IP，覆盖域名证书、首页、地图、恢复页和匿名权限边界。验收普通 IP 跳转时需检查日期与其他查询参数保留，恢复入口必须继续使用 IP origin。

Google 与百度站长验证和提交需要对应站长账号；IndexNow 接收不等于收录。已发布的飞书、公众号和雪球内容是独立副本，必须有可用授权才能检查与修正，不能把网站发布当作外部副本已更新。
