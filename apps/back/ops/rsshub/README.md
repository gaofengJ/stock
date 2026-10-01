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

容器设置开机自动恢复、1 核 CPU、1 GiB 内存上限、Node 堆上限 512 MiB，使用内存缓存，容器内提供按需启动的 Chromium Headless Shell，不额外部署 Redis。缓存有效期 120 秒。日志写入 journald，遵循服务器现有的最近 30 天保留规则。

## 镜像与旧系统兼容

部署时核对的官方 AMD64 镜像：`ghcr.io/diygod/rsshub@sha256:835f90f9d8b1aed21f01b63fb909c2ec4b3e7fed88d71f2c45252d9a9c61d8e1`。

服务器使用 Docker 18.09、Linux 4.4。官方镜像的 zstd 压缩层转换为 gzip 后，通过现有国内仓库拉取：`registry.cn-hangzhou.aliyuncs.com/mufengtongxue/stock-back@sha256:5f2f4f8277cbff99ef670d507d811d4a70b80946f579708ecaa80928cc5f5c39`。转换前后镜像配置与未压缩文件系统相同，镜像 ID 都是 `sha256:175b7b2f08113692ed738624ed30b36beb1f09c1225769212ff72b31e2fbcdd1`。这是当前财经扩展镜像的固定基础镜像。

财经扩展镜像为 `registry.cn-hangzhou.aliyuncs.com/mufengtongxue/stock-back@sha256:b8c1393310ce0663f6a514e9c1e8855a51f2e70c3d1105c3dcac1cffc754f804`，镜像 ID 为 `sha256:1cfa050b8c8992f7fa16351f1677b663a858d9aeabeb8b28f390d8f24003dd11`。同目录的 `Dockerfile` 与 `patch-runtime.cjs` 提供重建来源：修正固定 RSSHub 打包文件中 Day.js UTC 插件缺少 `.js` 后缀的问题，安装固定 Patchright 1.63.0 对应的 Chromium Headless Shell 153.0.8010.12 及系统依赖，并启用浏览器 TLS 证书校验。重建应在现代 Docker/BuildKit 环境完成，发布使用 gzip/v2s2 层，不在旧生产系统中临时安装依赖。

`compat.c` 是针对该服务器的静态兼容启动器。对 Linux 4.4 不支持的新系统调用返回 ENOSYS，让 Node/glibc 使用旧调用；保留 Docker 外层 seccomp 的限制。容器仍以 UID 1000 运行，移除所有 capabilities，禁止获得新权限。内核或 Docker 升级后应重新测试并评估是否移除启动器。健康检查和 `docker exec` 的 Node 命令也需要先运行 `/usr/local/bin/rsshub-compat`。

## 网站配置与维护

后端环境变量 `RSSHUB_BASE_URL` 默认在生产环境为 `http://rsshub:1200`、开发环境为 `http://127.0.0.1:1200`。`NEWS_SYNC_ENABLED` 默认生产启用、开发关闭；可显式设为 `false` 停止采集。发布脚本在重建后端容器后自动连接 `stock-news` 网络。

资讯迁移建独立的来源、资讯、个人收藏表。默认每 120 秒采集，调度器每 30 秒检查到期来源。MySQL 命名锁防止并行实例重复执行；最多两个采集线程。失败按来源逐步退避，已入库内容仍可读。普通浏览和页面刷新只读数据库，管理员提交采集任务立即返回，不占用 HTTP 请求等待抓取。

来源地址写死在 `news.sources.ts`，管理员仅可启停及设置 60～3600 秒间隔。目录保留 19 个历史配置：5 个研报订阅已退役、不再采集和展示，普通页面仅显示已启用、成功采集且当前无故障的新闻来源。当前可用入口为 13 个，管理员另外保留新浪滚动报道的诊断与启停配置。配置变化由独立迁移 `NewsDisplayPolicy1790835600000` 停用研报并启用彭博公开 RSS，已有资讯和收藏不删除。快讯默认每 120 秒采集，新报道/话题每 600 秒，彭博每 300 秒读取外部采集快照。证券时报没有有效发布时间的条目标注首次采集时间。重点路由暂不可用时普通快讯仍采集。

管理员在资讯页面的“来源管理”中修改配置并查看故障；普通用户仅查看可用来源的介绍。默认列表与筛选不显示失败、停用、尚未成功采集的来源，成功恢复后自动重新出现。个人收藏继续保留已保存的新闻，不因来源临时故障丢失。资讯正文转为纯文本，原文仅允许 http/https；禁止自定义抓取 URL。未收藏资讯保留 30 天，收藏内容保留；日志仍只保留最近 30 天。

升级 RSSHub 时先验证 Docker 压缩格式、Node 兼容性和各来源 JSON Feed，再修改固定镜像版本。不要盲目拉取 `latest`，也不要停用整台服务器的 seccomp。

## 财经来源与故障结论

| 平台 | 接入内容 | 服务器验证 |
| --- | --- | --- |
| 金十数据 | 普通与重点快讯 | 可用 |
| 第一财经 | 快讯、头条 | 可用 |
| 证券时报 | 快讯 | 可用；空发布时间以首次采集时间展示 |
| 财联社 | 电报、头条、重点电报 | 普通电报与头条可用；重点电报独立取数 |
| 华尔街见闻 | 快讯、资讯、重点快讯 | 普通快讯与资讯可用；重点快讯独立取数 |
| 同花顺 | 7×24 快讯、重点快讯 | 普通快讯可用；重点快讯独立取数 |
| 东方财富 | 股市关键词新闻 | 可用；策略/宏观/券商晨报/行业/个股研报已停采、隐藏 |
| 雪球 | 今日话题中的热门讨论 | 配置浏览器后可用；旧热帖接口返回 400，不重复接入 |
| 新浪财经 | 公开快讯接口、滚动报道 | 快讯可用；滚动报道仍返回 403，保留入口且默认关闭 |
| 彭博 | 官方公开市场 RSS 的标题、摘要和原文链接 | 境外 GitHub Actions 采集，经 SSH 同步到服务器 |

新浪快讯使用其网页公开的固定接口 https://app.cj.sina.com.cn/api/news/pc，由后端转换为与 RSSHub 一致的数据结构；不接收用户提供的 URL、Cookie 或账号。与滚动报道分开记录，避免把快讯当作完整报道。

新浪滚动接口 HTTPS/HTTP 从服务器均返回 403，财经网页及快讯接口返回 200，说明失败在该接口访问链路。彭博服务器系统 DNS 返回不属于彭博的异常地址，独立网络解析为 Fastly 地址；使用该地址并保留 SNI 与证书校验时 TLS 握手仍中断，因此只改 DNS 不能恢复。没有修改整台服务器的 DNS、没有禁用 TLS 验证，也没有配置未经授权的代理。

东方财富 7×24 公开接口在当前服务器返回 567，当前展示的是股市新闻搜索，不能宣称覆盖其全部快讯。所有来源只覆盖对应公开订阅内容，RSSHub 支持某个平台不代表该平台所有栏目都已接入。

## 彭博外部采集

`.github/workflows/bloomberg-news.yml` 在 GitHub 标准 Ubuntu 执行器上每 5 分钟请求固定的 `https://www.bloomberg.com/feeds/markets/news.rss`，只取公开标题、摘要、时间与链接，最多 30 条。不请求文章全文、不需要彭博账号。已实测读取 20 条带时间及原文链接的市场新闻。

任务复用现有 SSH Secrets，把 JSON 与接收程序传到 `/opt/stock-news/staging/<run_id>`。接收程序校验来源、条目域名、时间和大小后原子替换 `/opt/stock-news/feeds/bloomberg.json`，成功后仅清理该任务自己的暂存文件。上一次有效快照在失败时保留，不长期积累 XML、JSON 或 GitHub artifacts。后端通过只读目录挂载 `/run/stock/news-feeds` 读取，再走相同的清洗、去重、入库与 30 天保留流程；不开放额外公网接口。

后端再次验证快照和文章来源，超过 45 分钟的快照视为故障并从普通页面隐藏；历史新闻和个人收藏仍保留。默认文件位置可通过受信任的服务器配置 `BLOOMBERG_FEED_FILE` 调整。手动更新：在 GitHub Actions 中运行 “Collect public Bloomberg news”。

GitHub 定时任务可能排队或被丢弃，5 分钟是计划间隔，不是实时保证；公开仓库连续 60 天无活动会自动停用定时任务，需在 Actions 中重新启用。若将来需要严格、持续的更新时延，可将同一个标准库采集程序迁到长期运行的境外节点。标准 GitHub 执行器在本公开仓库免费，无须额外 VPS 或代理订阅，但仍受 GitHub 调度和可用性约束。

参考：[GitHub 定时任务](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)、[标准公开仓库执行器](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)。

浏览器已在 Linux 4.4、Docker 18 默认 seccomp 下通过启动及雪球采集验证；候选容器测试约使用 429 MiB，生产内存仍受 1 GiB 上限约束。服务和页面分别展示来源状态及采集延迟。
