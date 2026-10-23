# 投资小站前端

Next.js App Router 静态导出，部署为 Nginx 内容镜像，API 由同源 `/api` 转发到后端。图表按可视区域初始化，复盘截图通过 `reviewCapture=1` 主动初始化全部所需图表。

在仓库根目录按 `.nvmrc` 使用 Node 24.21.0，并使用 pnpm 9.15.9 安装依赖。开发运行 `pnpm dev:front`；验证运行 `pnpm -C apps/front run lint` 和 `pnpm -C apps/front run build`。构建包括日期、格式、鉴权、路由等行为检查，产物位于 `apps/front/out`。

GitHub CI 使用合成数据和账户对静态产物执行浏览器回归，不连接生产 API。生产登录路径保留 `next`，只允许站内业务路径；所有修改操作仍由后端鉴权和 CSRF 校验。

生产发布步骤见 [运维说明](../../ops/volc/OPERATIONS.md)。UI 文案约定见 [AGENTS.md](AGENTS.md)。
