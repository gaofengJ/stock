# 250 交易日固定报告

本次报告覆盖 2025-09-18～2026-09-30（最新完整行情日），并用额外 122 个交易日预热。所有股票以历史上市身份和信号日名称筛选，包含当时上市、后来退出上市的股票；北交所新旧代码按已核验映射归一。

默认条件直接复用 DailyService、trend-rules 和 strategy-validation。前六个形态策略的形态日、放量突破的信号日自由流通换手率严格大于 5%；回踩企稳、五线顺上沿用自身默认条件。每个策略内的股票×信号日独立计数，跨策略汇总不去重。

收益为信号日后复权收盘至第 N 个市场交易日后复权收盘的涨跌，不扣成本；超额是同期股票收益减上证指数收益（百分点）。零收益不算上涨，零超额不算跑赢。停牌／无成交、退出上市、未到期、缺失分开标记，不顺延日期，不用零代替缺失。置信区间为独立信号口径的 95% Wilson 区间，不校正同日／同股相关性。月度按信号日分组，首尾月不满月。

以下命令在仓库根目录执行。数据库和来源凭据仅从 `APP_ENV_FILE` 读取，不写入输出。私有提取目录不得放入 frontend/public 或提交 Git。提取在数据库一致性只读事务中执行，不启动应用或后台任务；历史名称补取仅查询已有 Tushare 服务使用的 [bak_basic 历史目录](https://tushare.pro/document/2?doc_id=262)，写入本地私有快照，不修改生产库。

```powershell
$env:APP_ENV_FILE='ABSOLUTE/PATH/TO/.env.development'
node ops/strategy-study/extract.cjs ABSOLUTE/PRIVATE/FOLDER
node ops/strategy-study/supplement-names.cjs ABSOLUTE/PRIVATE/FOLDER
node --max-old-space-size=6144 ops/strategy-study/compute.cjs ABSOLUTE/PRIVATE/FOLDER ABSOLUTE/PUBLIC/FOLDER
node --test ops/strategy-study/statistics.test.cjs
node ops/strategy-study/verify.cjs ABSOLUTE/PUBLIC/FOLDER
node ops/strategy-study/compare-production.cjs ABSOLUTE/PRIVATE/FOLDER ABSOLUTE/PUBLIC/FOLDER
```

`verify.cjs`从全量信号独立重算全部 36 组策略周期统计和全部月度统计，并检查样本分区、极值、唯一键、覆盖完整性。`compare-production.cjs`以数据库只读事务抽查三个交易日的三个趋势策略，要求选股代码集合与正式 TrendService 一致。筛选缺失必须先解决，不能把部分覆盖结果作为完整 250 日报告发布。

公开产物：summary.json（汇总、月份、极值、口径、数据和规则指纹），各策略 JSON（全量信号、四周期结果、个股均值排名），其 gzip 副本（浏览器按需加载），validation.json（可下载核查记录）。JSON 数值保留精度，页面展示两位小数。数据仅生成一次，不随页面日期、行业或筛选参数变化。报告首次只读汇总，明细延迟读取并按策略缓存，不调用动态统计接口。新增快照必须修改前端 BASE 路径和版本，重新完成核查后部署。
