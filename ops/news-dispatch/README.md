# 服务器触发境外资讯采集

生产服务器的 `stock-news-dispatch.timer` 每 5 分钟调用 GitHub `workflow_dispatch`，继续使用标准境外 runner 采集新浪财经和彭博市场。GitHub 自带定时任务改为每小时后备；服务器重启后 systemd 自动恢复调度。

## 专用凭据与部署

在 GitHub 创建 fine-grained token，资源所有者选择 `gaofengJ`，仅选择 `stock` 仓库，Repository permissions 的 Actions 设置为 Read and write。按设定的有效期提前轮换。将其保存到仓库 Actions Secret `NEWS_DISPATCH_TOKEN`，不要提交到代码、聊天或日志。

合并后运行工作流 `Manage server news scheduler`，选择 `deploy`。它先验证凭据，再安装服务并执行一次触发，最后启用定时器。凭据保存在服务器 root 可读的 `/etc/stock-news-dispatch.env`，不会进入后端容器、浏览器或 Docker 镜像。调度程序使用独立系统账号 `stock-news-dispatch`，只写自己的状态目录。

```bash
systemctl list-timers stock-news-dispatch.timer --no-pager
journalctl -u stock-news-dispatch.service --since '30 minutes ago' --no-pager
python3 -B /opt/stock-news/scheduler/dispatch.py --inspect
```

也可以运行工作流的 `inspect` 操作，输出计时器和非敏感状态；`disable` 仅停用服务器计时器，GitHub 每小时后备继续保留。

## 重试、防重复与告警

调度前检查现有任务，运行或排队中的同一采集任务不会再次触发。systemd oneshot、本地文件锁和 GitHub concurrency 共同防止并行采集。重复手动调用在 4 分钟内被合并；正常每 5 分钟的新轮次不受影响。

只读 API 请求遇到暂时性网络/限流错误时重试。触发 POST 若超时，可能已经启动任务，因此先保存唯一触发标记，后续通过运行记录核实；10 分钟内不盲目重发。下一轮计时器会重试确定失败的请求。认证失效返回明确的 HTTP 状态，轮换 Secret 后重新运行 `deploy`。

检查每个来源快照的真实 `generated_at`，超过 15 分钟输出 `NEWS_ALERT` 到 systemd journal，同时网站来源状态显示“更新延迟”；超过 24 小时仍按原逻辑暂停展示该来源。状态文件 `/opt/stock-news/scheduler/state/status.json` 记录最近触发结果、运行 ID、来源更新年龄和错误，不记录凭据。不发送外部邮件或聊天消息。

采集结果先交付服务器，译文稍后补充；翻译失败仍可阅读原文。传输或源站故障、GitHub 执行器排队仍可能影响更新时间，5 分钟是本机触发频率，不是源站更新或端到端完成的保证。

## 测试

```bash
python3 -m unittest discover -s ops/news-dispatch -p 'test_*.py'
bash -n ops/news-dispatch/install.sh
```

程序兼容生产服务器 Python 3.5，仅使用标准库，不新增数据库、常驻容器或公网接口。
