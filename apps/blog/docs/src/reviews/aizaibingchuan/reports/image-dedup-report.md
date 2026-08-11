# 爱在冰川图片去重报告

- 模式：已执行迁移
- 扫描文章：2,276
- 已改写文章：1,124
- 已迁移重复源图片：11,644
- 公共图片：5,162
- 已释放空间：90.1 MiB
- 引用校验：25,481 个图片引用均能在 `public` 中找到对应文件

公共图片位于 `docs/src/public/imgs/aizaibingchuan/shared/`，文件名使用原文件内容的 SHA-256。后续新增图片可运行 `pnpm --filter blog run dedupe:aizaibingchuan-images -- --apply` 复用同一迁移规则。
