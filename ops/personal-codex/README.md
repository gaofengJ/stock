# 个人 Codex 网页控制台

## 当前发布方式

原生前端、权限检查和独立服务源码现已统一进入仓库。前端通过 master 的 Volcengine CI/CD 正常构建发布；静态导出检查强制包含 `/admin/ai/`，构建执行 AI 入口与权限回归测试。无需再次应用补丁。

本目录的 `admin-entry.patch`、`native-ui.patch` 和独立前端发布脚本是历史版本的恢复材料，保留用于审计；不能应用到当前 master，也不应重新运行以覆盖正式前端。独立 AI 服务保持原部署，不随网站前端发布重建，不读取或迁移个人任务记录与凭据。下文带日期的部署记录仅描述当时情况。

仅供网站账号 `mufeng`（部署时通过数据库验证并绑定固定用户 ID）本人使用。不是共享模型网关。

## 结构

- 网站入口：每日复盘 → 智能复盘；策略选股的候选列表/横向比较 → 智能对比；管理后台 → 模型设置（`/admin/ai/`）。三个入口只对固定用户 ID 1 且当前仍为管理员时显示。
- 原生 React/Ant Design 页面和侧栏共用网站主题，不再使用 iframe。独立执行容器 `stock-personal-console` 只绑定宿主机 `127.0.0.1:18787`，保留 `/personal-ai/api/*` 受保护接口；旧 `/personal-ai` 和 `/personal-ai/` 页面地址重定向到模型设置。
- 本次仅重新构建前端及独立控制台；网站后端和业务数据库结构未修改。登录和取数复用现有只读接口。
- Node 运行时从已经部署且固定摘要的后端镜像提取，模型二进制复用已验证的 `stock-codex:0.163.0`。镜像不包含账户、网站代码或环境密钥。
- 运行权限：UID 10001，只读根文件系统、无额外 capabilities、无 Docker socket、0.75 CPU、768MB 内存。
- 存储：`/srv/stock-personal-console/tasks.json`，目录0700、文件0600。保留30天，提交新任务时清理过期记录；页面展示最近30项。该文件包含私人问题和结果，应视为敏感业务数据。

## 使用

1. 用 `mufeng` 登录原网站，在每日复盘或策略选股页面选择已完成同步的日期，点击“智能复盘”或“智能对比”。
2. 侧栏自动带入日期；对比从当前可见候选中选择最多3只股票，同时冻结打开侧栏时的当前策略和参数。业务Skill随页面确定，不要求用户重复选择。
3. 选择模型、档位并输入问题，再点击“开始分析”。打开侧栏、修改选择或新建会话只改变界面，不调用模型。
4. v2已完成结果支持继续追问，沿用原数据快照和策略参数；旧版记录可以查看，但需新建分析才能使用新版完整上下文。关闭侧栏不会取消已提交任务。
5. 管理后台“模型设置”提供默认模型、订阅状态和用量。默认偏好只保存模型与档位，按账号隔离在当前浏览器；服务器仍校验模型及档位白名单。手动刷新状态仅查询元数据。

默认 `gpt-6.1-sol/high`，可选 `gpt-6-astra` 与目录支持的档位。目录可见不是实际模型调用验证。任何失败都不会由应用层自动重新提交任务；官方 CLI 内部的网络重连行为由其版本决定。

## 费用及 Token

- 只有提交任务和追问会触发模型。启动服务、打开页面、状态刷新不会推理。
- 单并发、每天20个任务、每日200,000输入加输出Token预算；每任务预留32,000，完成后按报告用量结算。未返回用量的已启动任务保留预留量，不能据此认为实际用量为零。
- 预留量和每日预算属于准入控制，不是服务端的单次Token硬上限。正在运行的任务可能超过预留；超额后阻止后续任务。
- 业务快照18KB、总业务上下文24KB、问题2000字、追问6轮、模型执行180秒、输出16,000字符、事件流512KB上限。Codex系统上下文额外计入输入。
- 额度未知、任一已报告窗口使用达到90%、账号失效时停止新任务。不会回退到API Key，也不存在购买credits或重置额度代码。
- 不自动购买credits不等于服务端保证绝不扣已有credits。保留订阅余量不能替代账号级消费控制。

## 安全边界

每次资源请求检查固定用户ID、当前admin角色和密码变更状态。只读请求共享最多2秒的 `/api/auth/me` 结果，合并同一会话并发检查，避免资源加载触发现有网站10秒7次限流；短缓存仅存进程内并使用会话哈希键，账号失效或撤权对只读内容最多有2秒延迟。写请求及执行前强制实时验证，精确校验Origin与现有网站相同的CSRF派生规则。其他管理员亦不能读取页面和任务。嵌入仅允许同源祖先，父页面只接收指定iframe及本站origin发来的就绪和尺寸消息。

进程通过参数数组和标准输入接收任务，不使用shell拼接。不提供任意命令、端点、文件路径或SQL接口。只发送限定日期和范围的业务数据；禁用shell、联网搜索、多代理等工具，使用只读sandbox与ephemeral会话。模型返回通过React文本节点渲染有限Markdown标题、列表、加粗和表格，不执行HTML或脚本，不创建外部链接和图片。

订阅凭据沿用 `/etc/stock-codex/auth.cred` 的systemd主机加密；运行时使用 `/run/stock-codex/home` 内存文件。刷新后由root拥有的systemd path/service再次加密。凭据、Cookie、代理密码不出现在任务记录、Docker环境变量、镜像或HTTP响应中。启动模型前检查ChatGPT账号hash与原有绑定一致。

## 检查与运维

本地测试（全部模拟模型）：

```sh
node --test ops/personal-codex/console.test.mjs ops/personal-codex/web-flow.test.mjs
node --test apps/front/scripts/test-personal-ai.cjs
node --test apps/front/scripts/test-personal-ai-native.cjs
```

已授权主机部署流程：上传本目录至 `/opt/stock-personal-console/source` 后运行 `python3 /opt/stock-personal-console/source/deploy.py`。该脚本不触发推理，检查账号后创建独立容器、准备加密检查点，并在备份和`nginx -t`通过后平滑新增专用路由。重复部署会停止，避免覆盖运行中实例。

- 状态：`systemctl status stock-personal-console.service`、`docker inspect stock-personal-console`。
- 停止：`systemctl stop stock-personal-console.service`，只影响控制台。
- 临时禁止新任务：在 `/srv/stock-personal-console/disabled` 创建空文件。删除该文件恢复；已运行任务需在页面取消或停止服务。
- 加密状态：`/opt/stock-personal-console/checkpoint-status.json` 和 `systemctl status stock-personal-console-checkpoint.service`。
- 原Nginx配置备份：`/opt/stock-personal-console/nginx-before.conf`。回滚时只移除新增的personal-ai location块，先`nginx -t`再reload，勿盲目覆盖其后其他人的配置改动。
- 模型进程中断后不会自动恢复任务。容器异常退出可重启本服务；若宿主机重启，service先恢复运行时凭据再启动容器。

此实现按用户明确授权的个人网页控制台用途进行；技术实现及成功调用不构成对第三方服务授权范围的保证。

## 2026-10-18 管理后台入口发布

为避免发布主工作区的无关改动，前端基于线上提交 `5135909d76b68f708a4692455d201dade4abfe07` 单独构建。`admin-entry.patch` 是相对此提交的完整前端改动，后续常规发布必须包含这些改动，否则新镜像会覆盖本次入口。主工作区也已应用对应的最小源码修改，保留原有未提交改动。

`update-admin-entry.py` 使用临时前端验证页面及资源，再平滑切换Nginx流量、只更新正式前端容器，完成后恢复原上游并移除临时容器；旧哈希静态资源保留用于打开中的旧页面。`refresh-console.py` 只更新独立控制台，拒绝打断活跃任务，并保留停止状态的回滚容器。二者均不发起推理。

发布记录：`/opt/stock-personal-console/admin-entry-release.json`。前端镜像为 `stock-front:personal-ai-admin-5135909d`，`release.env` 中仅更新 `FRONT_IMAGE`；控制台镜像以发布记录为准。Nginx和原发布设置的root-only备份保存在同目录，不能输出原发布环境文件。

验收限制：内置浏览器两次超时，未完成真实浏览器视觉检查；已通过实际HTTP资源与登录权限检查、TypeScript类型检查、前端既有测试和无推理模拟交互检查。Next构建的ESLint阶段存在既有依赖缺失（jsx-a11y），页面编译和静态导出成功，未为本次任务调整整个项目的lint依赖。

## 2026-10-18 原生业务模块改版

原生界面首版前端镜像为 `stock-front:personal-ai-native-20261018`，发布记录在 `/opt/stock-personal-console/native-ui-release.json`。后续常规发布应包含 `native-ui.patch`（替代上一版 `admin-entry.patch`，均相对同一个线上基准提交），避免覆盖已发布入口。新增组件目录为 `apps/front/src/components/PersonalAi/`，独立模型执行服务和凭据配置未修改。

`deploy-native-ui.py` 仅更新前端，先验证临时容器与55个页面资源，再切换流量；`route-native-entry.py` 只重定向旧页面，不改变受保护API路由。重新提交同一个未收到响应的分析请求时沿用幂等ID，避免网络故障下产生重复任务。结果按纯文本渲染，不执行模型返回的HTML。

改版验证：101项既有前端测试、5项原生界面与本人权限检查、类型检查、静态导出通过；发布前后任务记录不变，模型调用为0。内置浏览器再次超时，真实浏览器视觉与点击验收仍待确认。页面构建仍报告上述既有ESLint插件缺失，未把此情况描述为lint通过。

入口可见性后续调整：菜单顺序为用户管理、登录动态、角色管理、模型设置、数据同步、日志中心。智能复盘和智能对比放在各业务页面标题下方，使用主按钮和简短操作说明；缺少日期、正在加载、无候选或当前为历史信号视图时明确显示不可用原因。仅本人可见的限制不变。

菜单顺序调整时的前端镜像为 `stock-front:personal-ai-menu-order-20261018`，由 `deploy-menu-ui.py` 复用原生前端发布流程，记录在 `/opt/stock-personal-console/menu-order-release/native-ui-release.json`。`native-ui.patch` 已包含这些后续调整。

## 2026-10-18 业务上下文 v2

最新发布：前端 `stock-front:personal-ai-context-v2-20261018`、独立执行服务 `stock-personal-console:context-v2-20261018`。仅修改前端及独立AI服务，原网站后端和数据库结构不变。前端记录位于 `/opt/stock-personal-console/context-ui-release/native-ui-release.json`，服务更新脚本为 `deploy-context-console.py`。发布前会在无网络、无凭据挂载的临时容器中运行模拟模型测试，并拒绝打断活跃任务。原容器保留为 `stock-personal-console-before-context-v2`。

策略对比：服务器按白名单参数重新请求当前策略候选，核验代码、交易日期和行情。按两路以内并发读取大盘广度、主要指数、行业题材、已披露业绩及个股K线；逐股K线请求串行。走势严格剔除所选日期之后的数据，缺失交易日不跨越补齐。个股报价采用原始口径，趋势价格和均线标明复权口径；财务按公告日期过滤。行业全部保留，题材按明确规则最多4个并披露省略数，小数取3位。数据源失败和数值缺失明确记录，401/403/429不会静默降级。

每日复盘：大盘和指数与候选集合分开统计；使用所有候选计算行业题材分布，仅展示原接口排序前12只个股及其命中策略、量价和风险。明确策略覆盖、样本数量和偏差，不读取私人笔记或持仓，不自动回写。复盘不为全部候选逐一调用长K线/完整财务接口，深度分析走策略选股。

两处面板均支持“检查分析数据”：调用受本人身份及CSRF保护的 `/personal-ai/api/preview`，只检查网站数据，不启动Codex、不查询模型额度、不创建任务或占用Token预算。数据准备总时限120秒，单个数据请求至多60秒；界面预览超时150秒。正式分析重新验证权限和数据，不把浏览器传入的数值当作可信行情。

执行记录增加取数、调用前账号检查、模型进程、结束账号检查和总耗时；首次事件和首次完整答复时间仅为进程观测，不等同于网络延迟或首Token时间。模型Token仍按实际报告统计，预览KB不是Token估价。诊断时间不进入模型上下文，既有预算和订阅限制保留。

验证：22项服务/上下文/模拟流程测试、7项原生UI和权限/安全渲染检查、101项既有前端测试及类型检查/静态导出。本地实际行情样本转换验证覆盖3只股票、132个行情日/股及主要指数；测试适配器提供接口形状，不冒充真实登录浏览器验收。未发起真实模型调用。内置浏览器连接超时；既有ESLint缺失插件情况仍存在，不报告lint通过。

### 大盘接口路由修复

2026-10-18发现v2大盘取数遗漏`analysis`模块前缀，两个业务场景均错误调用`/api/market/...`，返回404后被当成可选数据缺失，导致不完整上下文仍进入模型。已统一改为`/api/analysis/market/candidate-environment`及`/api/analysis/market/overview`。大盘和指数的接口错误现在会在推理之前停止；成功响应中的真实数据缺项仍按实际情况披露。不完整历史快照禁止继续追问，原结果不改写。

修复服务镜像为`stock-personal-console:market-route-fix-20261018`，脚本`deploy-market-route-fix.py`；前端不变。增加真实前端客户端/后端嵌套路由契约检查，避免测试与实现共同采用错误URL；本地25项测试、服务器24项隔离模拟测试。已从服务器验证旧路由404、正确路由401（匿名访问被保护）；不把此检查称为带登录凭据的数据端到端验收。发布前后业务任务记录不变，不发起模型调用。

## 2026-10-19 图文复盘与流式回复

复盘文档集中保留智能复盘、准备 Codex 任务、预览、保存。五组平台暗色图含20日行业轮动；更新按钮复用已有素材。分析要求可留空，结果按固定章节与原始用户记录合并，预览提供 HTML/纯文字剪贴板。飞书若过滤粘贴图片，Codex + lark-cli 可直接写入真实图片。

独立服务使用 `review/v3`：市场量能与指数、均线广度、情绪晋级、昨日强势股反馈、20日行业排名及涨停题材。候选对比继续使用 `candidate/v2`。真实 app-server `item/agentMessage/delta` 通过同源 SSE 到达前端，断线只重连读取，不重提推理。任务、预算、模型选择、身份与 CSRF 限制继续生效。部署脚本 `deploy-review-stream.py` 只替换独立服务并保留回滚容器，前端走正常 master CI/CD。

### 飞书直连调研

官方 lark-cli 支持云文档创建、编辑、读取和素材操作，也提供嵌入自研平台的扩展方式：
- https://github.com/larksuite/cli/blob/main/README.zh.md
- https://open.larkoffice.com/document/mcp_open_tools/embed-feishu-cli-in-agent.md

可在服务器增加私有后台任务：同日期/版本资料包 → lark-cli 写正文与真实图片 → 回读核验 → 回填文档 URL。以用户 ID、日期、保存版本和 generation 做幂等键，失败保留 doc ID 续接，禁止重复创建或覆盖更新后的原文。CLI 放在服务端，浏览器不执行 shell；只允许固定命令参数，正文和图片通过文件传递。需服务器独立的飞书 OAuth/应用配置、最小文档权限及凭据加密存储，本机授权不能直接复制。此次完成调研与现有 Codex 交接流程，不把直连显示成已经可用。
