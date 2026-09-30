# RSSHub 与实时资讯

服务器部署目录为 `/opt/rsshub`，镜像、启动参数和兼容程序校验值记录在 `deployment.json`，配置在 `config.env`，启动/恢复命令是 `/opt/rsshub/start.sh`。

RSSHub 仅监听宿主机 `127.0.0.1:1200`，后端通过专用 Docker 网络 `stock-news` 访问 `http://rsshub:1200`。前端请求网站自己的 `/api/news` 接口。不要把 RSSHub 端口直接开放到公网。

```sh
curl -fsS http://127.0.0.1:1200/healthz
docker inspect --format '{{.State.Health.Status}}' rsshub
docker stats --no-stream rsshub
docker logs --tail 100 rsshub
/opt/rsshub/start.sh
```

容器设置开机自动恢复、1 核 CPU、768 MiB 内存上限、Node 堆上限 512 MiB，使用内存缓存，不额外部署 Redis 和浏览器。缓存有效期 120 秒。日志写入 journald，遵循服务器现有的最近 30 天保留规则。

## 镜像与旧系统兼容

部署时核对的官方 AMD64 镜像：`ghcr.io/diygod/rsshub@sha256:835f90f9d8b1aed21f01b63fb909c2ec4b3e7fed88d71f2c45252d9a9c61d8e1`。

服务器使用 Docker 18.09、Linux 4.4。官方镜像的 zstd 压缩层转换为 gzip 后，通过现有国内仓库拉取：`registry.cn-hangzhou.aliyuncs.com/mufengtongxue/stock-back@sha256:5f2f4f8277cbff99ef670d507d811d4a70b80946f579708ecaa80928cc5f5c39`。转换前后镜像配置与未压缩文件系统相同，镜像 ID 都是 `sha256:175b7b2f08113692ed738624ed30b36beb1f09c1225769212ff72b31e2fbcdd1`。

`compat.c` 是针对该服务器的静态兼容启动器。对 Linux 4.4 不支持的新系统调用返回 ENOSYS，让 Node/glibc 使用旧调用；保留 Docker 外层 seccomp 的限制。容器仍以 UID 1000 运行，移除所有 capabilities，禁止获得新权限。内核或 Docker 升级后应重新测试并评估是否移除启动器。健康检查和 `docker exec` 的 Node 命令也需要先运行 `/usr/local/bin/rsshub-compat`。

## 网站配置与维护

后端环境变量 `RSSHUB_BASE_URL` 默认在生产环境为 `http://rsshub:1200`、开发环境为 `http://127.0.0.1:1200`。`NEWS_SYNC_ENABLED` 默认生产启用、开发关闭；可显式设为 `false` 停止采集。发布脚本在重建后端容器后自动连接 `stock-news` 网络。

资讯迁移建独立的来源、资讯、个人收藏表。默认每 120 秒采集，调度器每 30 秒检查到期来源。MySQL 命名锁防止并行实例重复执行；最多两个采集线程。失败按来源逐步退避，已入库内容仍可读。普通浏览和页面刷新只读数据库，管理员提交采集任务立即返回，不占用 HTTP 请求等待抓取。

来源地址写死在 `news.sources.ts`，管理员仅可启停及设置 60～3600 秒间隔。2026-10-01 服务器实测：金十、第一财经快讯、第一财经头条、证券时报可访问；新浪上游 403、彭博连接重置，默认关闭。证券时报没有有效发布时间的条目标注首次采集时间。重点快讯来自金十重要快讯路由，该路由暂不可用时普通快讯仍采集。

管理员在资讯页面的“来源管理”中修改配置；普通用户仅查看来源状态。收藏按已登录用户隔离。资讯正文转为纯文本，原文仅允许 http/https；禁止自定义抓取 URL。未收藏资讯保留 90 天，收藏内容保留；日志仍只保留最近 30 天。

升级 RSSHub 时先验证 Docker 压缩格式、Node 兼容性和各来源 JSON Feed，再修改固定镜像版本。不要盲目拉取 `latest`，也不要停用整台服务器的 seccomp。
