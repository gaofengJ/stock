export const internalFields = [
  ['dataState', '日期与数据状态', '记录行情日期、资料更新时间、缺失来源和统计口径。'],
  ['yesterday', '昨日判断验证', '原判断是什么？实际发生了什么？哪些被验证或否定？'],
  ['marketFacts', '市场事实', '指数、成交、涨跌广度及昨日强势股反馈，相较上一交易日有什么变化？'],
  ['marketJudgment', '市场与主线', '市场偏强还是偏弱？主线是什么？明天积极参与、少做还是等待？'],
  ['themes', '主线与题材演变', '方向、催化及来源、阶段、核心与跟随、持续性、转弱条件。'],
  ['execution', '今日操作', '买卖或持有什么，理由是什么，是否按计划执行？无交易可写等待。'],
  ['candidates', '候选与风险核验', '区分观察和执行。模式、方向地位、触发区间、失效条件、风险预算、公告来源与未知事项。'],
  ['normalPlan', '明日计划', '持仓怎么处理？关注哪只票，什么条件买、什么情况放弃？未触发就等待。'],
  ['strongPlan', '明日计划：转强或高开', '什么证据确认转强？超出计划区间如何取消？'],
  ['weakPlan', '明日计划：转弱或低开', '何时停止新增？持仓失效如何处置？无法成交如何跟踪？'],
  ['lesson', '今日一条经验', '具体案例、可复核结论、下一步验证。区分合规试错与执行偏差。'],
  ['toolEvidence', '候选与持仓工具记录', '从研究工具带入的快照，仅用于内部记录。'],
] as const;
export const publicFields = [
  ['title', '文章标题', '用市场的主要变化概括今天，不写个人收益。'],
  ['summary', '核心结论', '只填写确认可以公开的观点。'],
  ['market', '市场变化', '公开数据、变化、解释与反向证据。'],
  ['themes', '方向与题材', '公开催化、核心表现、阶段与持续性。'],
  ['watch', '后续观察', '需要验证的市场条件及判断失效条件。'],
  ['lesson', '方法与经验', '去个人化的案例与方法总结。'],
  ['sources', '资料来源与时间', '资料链接、统计截至时间及缺失说明。'],
] as const;
export interface NotebookContent { private: Record<string, string>; public: Record<string, string> }
export const emptyNotebook = (): NotebookContent => ({ private: Object.fromEntries(internalFields.map(([k]) => [k, ''])), public: Object.fromEntries(publicFields.map(([k]) => [k, ''])) });

export function internalText(date: string, value: NotebookContent) {
  return [`# ${date} 每日复盘与下一交易日计划`, '私人笔记，仅供内部使用。', ...internalFields.map(([key, label]) => `## ${label}\n${value.private[key] || '待填写'}`)].join('\n\n');
}
export function templateText() {
  return `# 每日交易复盘
日期：____

## 1. 市场与主线
市场状态：偏强 / 分歧 / 偏弱
重点方向及理由：
明日态度：积极参与 / 少做 / 等待

## 2. 今日操作
买卖或持仓：
是否按计划？哪里需要改正？
（无交易写“等待”，不必凑内容。）

## 3. 明日计划
持仓：继续持有的理由，退出条件。
候选：关注对象，买入触发，放弃条件，计划仓位。
条件不满足就不交易。

## 4. 一条总结
今天最值得保留或改正的一件事：

公开笔记：另行整理可公开的市场、主线与方法总结，标明数据日期和来源；不复制私人操作、仓位、盈亏或个人信息。`;
}
export function publicText(date: string, value: NotebookContent, channel: 'wechat' | 'xueqiu') {
  const p = value.public;
  const entries = channel === 'wechat'
    ? [['今日结论', p.summary], ['市场变化', p.market], ['方向与题材', p.themes], ['后续观察', p.watch], ['复盘经验', p.lesson], ['资料来源与时间', p.sources]]
    : [['核心观点', p.summary], ['市场与方向', [p.market, p.themes].filter(Boolean).join('\n\n')], ['接下来观察', p.watch], ['经验与来源', [p.lesson, p.sources].filter(Boolean).join('\n\n')]];
  return [`# ${p.title || `${date} 市场复盘`}`, `复盘日期：${date}`, ...entries.filter(([, v]) => v?.trim()).map(([label, text]) => `## ${label}\n${text}`)].join('\n\n');
}
export const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');
export function noteHtml(text: string) {
  return `<article style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.8;color:#222;max-width:720px;margin:auto">${text.split('\n').map((line) => {
    if (line.startsWith('# ')) return `<h1 style="font-size:24px">${escapeHtml(line.slice(2))}</h1>`;
    if (line.startsWith('## ')) return `<h2 style="font-size:18px;margin-top:24px">${escapeHtml(line.slice(3))}</h2>`;
    if (line.startsWith('### ')) return `<h3>${escapeHtml(line.slice(4))}</h3>`;
    return line ? `<p style="margin:8px 0">${escapeHtml(line)}</p>` : '';
  }).join('')}</article>`;
}
