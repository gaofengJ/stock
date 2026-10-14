# 火山独立演练部署

此目录仅用于新机 `mufengtongxue`，不替换阿里云当前发布流程。当前阶段没有自动切换、自动迁移schema或开启采集的入口。

- `compose.database.yaml`：独立MySQL项目，数据绑定到`/srv/stock/mysql`，只允许主机回环与容器内网访问。
- `compose.app.yaml`：前后端、文章和可选RSSHub；全部端口仅绑定127.0.0.1。自动采集、任务恢复和外部行情请求默认关闭。
- `Dockerfile.back`：Node24、非root后端；目录权限、运行配置和数据副本需准备好后才可启动。
- `blog.nginx.conf`：通过Compose的back服务名校验文章权限，去掉旧网桥地址。
- `check_stack.py`：检查最终Compose配置的镜像固定、私网端口和演练开关，`--test-config`只校验结构，不启动容器。
- 新GitHub工作流只做测试与构建并保留已验证镜像，不使用生产Secrets、不SSH到旧机、不发版。

运行配置文件由安全传输和新机账户初始化生成，不提交到仓库。不可直接使用旧库地址；MySQL8.4的数据目录必须来自已完成支持路径升级的数据副本。原始备份只用于恢复演练，最终切换前还需同步最新数据。

后台日志查看功能保留，日志大小轮转后的分片也必须可查询。Docker日志另外使用有界local驱动；应用日志用于管理后台，二者均需检查空间，不能只设置Docker轮转。

版本、完整校验、TLS/IP浏览器验收和恢复演练通过前，不启用新机生产任务、不修改DNS、不修改旧CI的服务器Secrets。

## 已验证进度（2026-10-14）

- OS主机名为`mufengtongxue`。Ubuntu24.04.5、Docker29.1.3、Compose2.40.3、宿主机Nginx1.24安全更新包已安装。
- Node24.21应用镜像在GitHub运行856项后端测试、账号/旧库集成测试和前端构建检查后打包；演练采用该批固定镜像，不因后续运维文件提交重新构建业务镜像。
- IP证书已经签发并通过续期dry-run，`stock-certbot-renew.timer`每4小时检查；入口在数据验收前维持维护状态。
- Docker29的containerd存储导入传统docker-save归档后，`.Id`可能变成OCI manifest摘要。必须同时验证归档SHA256，以及manifest中的config.digest与CI记录image-id一致，再记录服务器实际固定ID；不能把两者不同直接当成镜像内容改变。
- `restore_rehearsal.py`只接收完整且SHA256吻合的旧备份，拒绝覆盖已有stock库；在独立MySQL8.0容器恢复并对每表精确计数、计算校验和。此步骤不启用业务或切换生产。

## 镜像传输实测与权限

首批镜像通过GitHub构建产物下载至本机，再经SSH传新机；这是目前更快的已验证路径。GitHub runner直接SSH到上海的实测仅约数至十余KiB/s，大镜像传输试验主动终止，不能宣称直传已经适合作为正式CD。`volc-transfer.yml`保留为有15分钟上限的手动试验入口，尚非生产自动发布。

`stock-deploy`是独立上传账户，密钥仅能运行root持有的`receive_bundle.py`，不具备shell、sudo、Docker或端口转发权限。完整校验后的归档才进入`/srv/stock/incoming`，上传不会触发容器更新或流量切换；原临时迁移私钥未上传GitHub。上传凭据使用新增的`VOLC_REHEARSAL_UPLOAD_KEY`，旧生产Secrets未改。

文章和独立博客迁移保留已发布静态内容，CI逐文件SHA256对比，再换为已验证稳定Nginx。RSSHub采用已固定的近期财经扩展镜像，去掉旧宿主机内核的兼容启动器，仍需在新机验证路由。

日常入口和恢复边界见[运维说明](./OPERATIONS.md)。
