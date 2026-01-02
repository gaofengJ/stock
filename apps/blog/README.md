# 市场那些事 (Blog)

这是一个基于 VitePress 的静态资源站，用于记录市场复盘和文章。

## 开发

```bash
# 在根目录下运行
pnpm run dev:blog

# 或者在当前目录下运行
pnpm install
pnpm run docs:dev
```

默认端口为 `5173`。主应用 (`apps/front`) 在开发模式下配置为点击菜单时打开 `http://localhost:5173`。

## 部署

在生产环境中，该应用应构建为静态文件，并放置在主应用的 `/blog` 子路径下。

1. 构建：
   ```bash
   pnpm run docs:build
   ```
   构建产物位于 `docs/.vitepress/dist`。

2. 集成：
   将 `docs/.vitepress/dist` 中的所有文件复制到主应用构建输出目录 (`apps/front/out`) 的 `blog` 子目录下。
   
   例如：
   ```bash
   cp -r apps/blog/docs/.vitepress/dist apps/front/out/blog
   ```

   这样，访问 `/blog` 时即可加载 VitePress 站点。
