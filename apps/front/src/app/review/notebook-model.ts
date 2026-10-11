export const internalFields = [
  ['dataState', '日期与数据状态', '记录行情日期、资料更新时间、缺失来源和统计口径。'],
  ['yesterday', '昨日判断验证', '原判断是什么？实际发生了什么？哪些被验证或否定？'],
  ['marketFacts', '市场事实', '指数、成交、涨跌广度及昨日强势股反馈，相较上一交易日有什么变化？'],
  ['marketJudgment', '市场与主线', '市场偏强还是偏弱？主线是什么？明天积极参与、少做还是等待？'],
  ['themes', '主线与题材演变', '方向、催化及来源、阶段、核心与跟随、持续性、转弱条件。'],
  ['execution', '持仓与今日操作', '原预期 → 今日表现 → 理由是否仍成立 → 执行偏差。无交易也检查持仓；无持仓记空仓观察。'],
  ['candidates', '明日候选与取消条件', '通常留 0–2 只待触发：位置与模式、题材证据、触发条件、取消条件、风险核验。没有合格机会写无。'],
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
  const main = ['marketJudgment', 'execution', 'candidates', 'normalPlan', 'lesson'];
  const fields = [...main.map((key) => internalFields.find(([k]) => k === key)!), ...internalFields.filter(([key]) => !main.includes(key) && value.private[key]?.trim())];
  return [`# ${date} 每日复盘与下一交易日计划`, '私人笔记，仅供内部使用。', ...fields.map(([key, label]) => `## ${label}\n${value.private[key] || '未填写'}`)].join('\n\n');
}
export function templateText() {
  return `# 私人每日复盘
日期：____
只用于内部记录；每天打开网站每日复盘，按以下四步完成。

## 1. 看市场（10 分钟）
市场与主线：相较昨天，赚钱方向与强势股延续有什么变化？
明日态度及依据：寻找机会 / 谨慎观察 / 不新开仓。

## 2. 检查持仓与执行（15 分钟）
对照上次计划：原预期 → 今日表现 → 理由是否仍成立。
今日操作：是否按计划，是否拖延退出或为了回本重入？
无交易也检查持仓；无持仓记空仓观察。不补造昨日计划。

## 3. 筛选明日候选（20 分钟）
明日待触发通常 0–2 只，可以为零。
每只记录：位置与模式、题材证据、买入触发、放弃条件及风险核验。
顺势整理与下跌反弹分别记录；只有形态好看不算完成筛选。

## 4. 确定明日计划（15 分钟）
参与态度：
持仓：继续持有理由、退出条件。
候选：触发、取消、按交易规则核对的风险预算。
一条总结：明天最需要保留或改正的一件事。
保存版本，下一晚先核对原计划。

公开笔记另行整理：市场与主线、今日观察与应对、明日观察计划、一条总结；文末附来源与日期。不复制私人操作、仓位、盈亏或个人信息。网站导出不等于创建飞书文档，生成云文档需调用复盘 Skill。`;
}
// Both destinations use the same Feishu article; retain the channel argument for callers.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function publicText(date: string, value: NotebookContent, _channel: 'wechat' | 'xueqiu') {
  const p = value.public;
  const entries = [
    ['市场与主线', [p.market, p.themes].filter(Boolean).join('\n\n')],
    ['今日观察与应对', p.summary],
    ['明日观察计划', p.watch],
    ['一条总结', p.lesson],
    ['资料来源与时间', p.sources],
  ];
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
