# 市场那些事

VitePress 历史资料库，通过主站 `/blog/` 嵌入。文章资源位于 `/blog-frame/`，独立 Docker 容器提供服务。

## 开发与验证

```bash
pnpm install --filter blog --frozen-lockfile
pnpm -C apps/blog run prepare:pagefind
pnpm run dev:blog
```

开发端口 **8082**。正文更新后需重新生成 Pagefind 索引。主站开发端口为 8081。

资料首页与复盘目录共用 1120px 最大宽度。首页突出历史复盘入口，交易知识单独分类；文章正文保持适合阅读的宽度。复盘目录支持年份、月份和具体日期筛选，年度精华从新到旧排列。返回目录时恢复当前浏览器会话里的筛选条件；文章侧栏按年月折叠，当前文章所在月份自动展开。同日的不同版本保留独立链接。

嵌入文章库的 iframe 管理文章浏览历史，主站只同步分享地址，不在 `popstate` 中重新指挥文章跳转。搜索加载失败时可以重试；剪贴板不可用时提供可复制的完整分享链接。

```bash
pnpm -C apps/blog run test
pnpm run build:blog
```

构建自动生成导航、资料统计、最新复盘和搜索筛选字段，并检查全部静态页面的本地链接与图片引用。产物为 `docs/.vitepress/dist`。Linux 上还可运行 `node .github/scripts/test-blog-server.cjs`，验证实际 Nginx 路由和资源权限。

## 文章元数据与增量更新

原文文章使用 `title`、`published_at`、`source_url`。复盘日期从标题提取，与发布时间分别展示。无日期的整理资料显示“日期未标注”，不会使用部署时间冒充内容时间。交易规则的正式核验可在逐条对照官方条款后记录到文章正文；现有未核验文章明确显示状态及官方入口。

资料首页展示实际收录截止日期和导入报告中记录的失败数。它是历史库，不承诺每天同步。继续阅读记录保存在本机浏览器，最多 40 篇，30 天过期。

已有导入器会按原文 URL 和导入状态跳过已完成的内容，不必重复导入整个历史库：

```bash
pnpm -C apps/blog run import:aizaibingchuan -- --input /path/to/new-links.jsonl
pnpm -C apps/blog run build
```

新链接清单由维护者提供。先查看导入报告并重试失败文章，再提交 Markdown 和新增图片；不要把未成功采集的内容标为已收录。没有新链接时，首页仍显示真实截止日期。

## 权限与部署

所有文章 HTML、正文 JS、图片和 Pagefind 数据都由 Nginx `auth_request` 调用后端 `/api/auth/blog-access`，使用 `blog:read` 和现有游客体验时限。检查失败时禁止返回正文；此接口不会启动或延长体验。浏览器不缓存受保护资源。

容器使用唯一的 `default.conf`，支持无后缀文章和 `/blog-frame/` 前缀访问。当前部署通过 Docker bridge 网关 `172.17.0.1:3000` 访问后端；迁移网络时须同步修改并运行权限测试。不要额外开放未受保护的静态镜像服务。

GitHub Actions 在 PR 中构建、检查路由和权限；合并后等主站对应发布成功再部署文章库。未更改图片的提交自动使用增量发布，逐文件校验服务器已有媒体后复用，保留回滚镜像。新增图片使用完整镜像发布。两种发布都先确认权限接口已可用。

分享地址形如 `/blog/?article=%2Freviews%2F...`，主站与 iframe 使用限定来源和窗口的消息同步文章及主题。直接访问文章也要经过权限校验。
