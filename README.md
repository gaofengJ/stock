# 木风同学的投资小站

这是一个 pnpm workspace：`apps/front` 为 Next.js 静态前端，`apps/back` 为 NestJS/Fastify API、数据同步与新闻服务，`apps/blog` 为受权限保护的文章。MySQL 保存业务数据；火山 ECS 使用 Docker Compose 部署，GitHub Actions 验证与分发固定摘要镜像。

## 开发

```bash
nvm use
corepack pnpm install --frozen-lockfile
corepack pnpm dev:front
```

使用 Node 24.21.0、pnpm 9.15.9；不要提交运行配置或密钥。后端使用独立测试库，不默认连接生产库。前后端具体说明见 [后端](apps/back/README.md) 和 [前端](apps/front/README.md)。

## 验证与发布

完整 CI 包括前后端构建、单元测试、MySQL 8.4 集成测试、浏览器交互、文章鉴权、运维故障与恢复测试。业务代码与依赖变更均需通过完整 CI。依赖安全扫描阻断已知 high/critical 生产依赖告警。

master 成功后自动发布同批镜像到既有 ACR，再由服务器核验并切换；数据库 DDL 单独执行，不能通过合并代码自动迁移。详见 [当前生产运维](ops/volc/OPERATIONS.md)。
