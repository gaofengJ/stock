import { Materials } from './materials-contract';
import {
  Article, ArticleImage, Research, illustratedText,
} from './article-contract';

export const internalFields = [
  ['dataState', '日期与数据状态', '记录行情日期、资料更新时间、缺失来源和统计口径。'],
  ['yesterday', '昨日判断验证', '原判断是什么？实际发生了什么？哪些被验证或否定？'],
  ['marketFacts', '市场事实', '指数、成交、涨跌广度及昨日强势股反馈，相较上一交易日有什么变化？'],
  ['marketJudgment', '市场与主线', '市场偏强还是偏弱？主线是什么？明天积极参与、少做还是等待？'],
  ['themes', '主线与题材演变', '方向、催化及来源、阶段、核心与跟随、持续性、转弱条件。'],
  ['execution', '持仓与今日操作（可选）', '例如：今天做了什么、持仓是否按预期发展。可留空，不会自动推断为无交易。'],
  ['candidates', '明日候选与取消条件', '通常留 0–2 只待触发：位置与模式、题材证据、触发条件、取消条件、风险核验。没有合格机会写无。'],
  ['normalPlan', '明日计划', '持仓怎么处理？关注哪只票，什么条件买、什么情况放弃？未触发就等待。'],
  ['strongPlan', '明日计划：转强或高开', '什么证据确认转强？超出计划区间如何取消？'],
  ['weakPlan', '明日计划：转弱或低开', '何时停止新增？持仓失效如何处置？无法成交如何跟踪？'],
  ['lesson', '闲聊', '想写什么就写什么。默认留空，AI 不代填。'],
  ['toolEvidence', '候选与持仓工具记录', '从研究工具带入的快照，仅用于内部记录。'],
  ['holdingEvidence', '持仓分析记录', '从持仓检查工具带入的结果，仅保存在私人记录。'],
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
export interface NotebookContent { private: Record<string, string>; public: Record<string, string>; article?: Article; research?: Research; materials?: Materials }
export interface SavedNotebook { date: string; revision: number; generation: number; content: NotebookContent }
export const emptyNotebook = (): NotebookContent => ({ private: Object.fromEntries(internalFields.map(([k]) => [k, ''])), public: Object.fromEntries(publicFields.map(([k]) => [k, ''])) });

export function internalText(date: string, value: NotebookContent) {
  const main = ['marketJudgment', 'themes', 'toolEvidence', 'execution', 'lesson'];
  const fields = [...main.map((key) => internalFields.find(([k]) => k === key)!), ...internalFields.filter(([key]) => !main.includes(key) && value.private[key]?.trim())];
  return [`# ${date} 每日复盘记录`, '私人笔记，仅供内部使用。', ...fields.map(([key, label]) => `## ${label}\n${value.private[key] || '未填写'}`)].join('\n\n');
}
export function documentTemplate(date: string, value: NotebookContent) {
  const evidence = value.private.toolEvidence || '';
  const picks = evidence.split(/\n\n+/).flatMap((block) => {
    const match = block.match(/^(.+?) \d{6}\.(?:SH|SZ|BJ)\n策略：([^\n]+)/m);
    return match ? [`${match[1]}｜${match[2]}`] : [];
  });
  const notes = ['marketJudgment', 'themes', 'candidates', 'normalPlan', 'strongPlan', 'weakPlan', ...(value.materials?.includeExecution ? ['execution', 'holdingEvidence', 'yesterday'] : [])]
    .filter((key) => value.private[key]?.trim()).map((key) => `### 用户记录：${internalFields.find(([name]) => name === key)?.[1] || key}\n\n${value.private[key]}`);
  return [
    `# ${value.public.title || `${date}复盘`}`, '> 本文由 AI 生成，仅供参考。',
    '## 市场数据', '### 市场概览', '### 情绪指标', '### 连板分析',
    '## 涨停板复盘', '## 策略选股', ...picks,
    ...(notes.length ? ['## 用户记录', ...notes] : []),
    '## 闲聊', value.private.lesson || '',
  ].join('\n\n');
}
// Both destinations use the same Feishu article; retain the channel argument for callers.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function publicText(date: string, value: NotebookContent, _channel: 'wechat' | 'xueqiu') {
  if (value.article?.body.trim()) return illustratedText(value.article.body, value.article.images);
  if (value.article?.images.length) return illustratedText(documentTemplate(date, value), value.article.images);
  const p = value.public;
  const entries = [
    ['市场与主线', [p.market, p.themes].filter(Boolean).join('\n\n')],
    ['今日观察与应对', p.summary],
    ['明日观察计划', p.watch],
    ['一条总结', p.lesson],
    ['资料来源与时间', p.sources],
  ];
  return [`# ${p.title || `${date}复盘`}`, `复盘日期：${date}`, ...entries.filter(([, v]) => v?.trim()).map(([label, text]) => `## ${label}\n${text}`)].join('\n\n');
}
export const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');
export function noteHtml(text: string, images: ArticleImage[] = []) {
  return `<article style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.8;color:#222;max-width:720px;margin:auto">${text.split('\n').map((line) => {
    const imageId = line.match(/^!\[.*\]\(review-image:([a-zA-Z0-9_-]+)\)$/)?.[1];
    const embedded = line.match(/^!\[(.*)\]\((data:image\/(?:png|jpeg);base64,[a-zA-Z0-9+/]+={0,2})\)$/);
    const media = images.find((item) => item.id === imageId) || (embedded ? { data: embedded[2], caption: embedded[1], source: '' } : null);
    if (media && /^data:image\/(png|jpeg);base64,[a-zA-Z0-9+/]+={0,2}$/.test(media.data)) return `<figure style="margin:24px 0"><img src="${media.data}" alt="${escapeHtml(media.caption)}" style="max-width:100%;height:auto"/><figcaption>${escapeHtml(media.caption)}${media.source ? `<br/>来源：${escapeHtml(media.source)}` : ''}</figcaption></figure>`;
    if (line.startsWith('# ')) return `<h1 style="font-size:24px">${escapeHtml(line.slice(2))}</h1>`;
    if (line.startsWith('## ')) return `<h2 style="font-size:18px;margin-top:40px">${escapeHtml(line.slice(3))}</h2>`;
    if (line.startsWith('### ')) return `<h3>${escapeHtml(line.slice(4))}</h3>`;
    return line ? `<p style="margin:8px 0">${escapeHtml(line)}</p>` : '';
  }).join('')}</article>`;
}
