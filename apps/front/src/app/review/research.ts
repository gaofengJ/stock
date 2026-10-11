import request from '@/api/request';
import { marketRequest } from '@/api/market';
import { numberText } from '@/utils/format';
import { Evidence, Research } from './article-contract';

const n = (value: unknown) => numberText(value);
const count = (value: unknown) => numberText(value, 0);
const points = (items: { label: string; value: unknown }[]) => items.filter((p) => p.value !== null && p.value !== undefined && Number.isFinite(Number(p.value))).map((p) => ({ label: p.label, value: Number(p.value) }));
// Each source is independent: partial failures must not discard usable evidence.
export async function loadResearch(date: string): Promise<Research> {
  const definitions = [
    {
      key: 'market',
      title: '大盘与指数',
      path: '/analysis/overview',
      endpoint: 'overview',
      unit: '家',
      read: (d: any) => {
        if (!d.snapshot) throw new Error('行情尚未就绪');
        const m = d.snapshot;
        return { text: `全市场成交额 ${n(m.amount)} 亿元；上涨 ${count(m.up)} 家，下跌 ${count(m.down)} 家，平盘 ${count(m.flat)} 家。\n${(d.indexes || []).map((i: any) => { const p = i.series.find((v: any) => v.date === date); return `${i.name}：${p ? `${n(p.close)} 点，涨跌幅 ${n(p.pctChg)}%` : '当日数据缺失'}`; }).join('\n')}`, points: points([{ label: '上涨', value: m.up }, { label: '下跌', value: m.down }, { label: '平盘', value: m.flat }]) };
      },
    },
    {
      key: 'breadth',
      title: '均线广度',
      path: '/analysis/overview',
      endpoint: 'breadth',
      unit: '%',
      read: (d: any) => {
        if (!d.snapshot) throw new Error('广度尚未就绪');
        return { text: `MA20 上方占比 ${n(d.snapshot.ma20.ratio)}%；MA60 上方占比 ${n(d.snapshot.ma60.ratio)}%。分母为各均线有效样本，缺失样本不计入。`, points: points([{ label: 'MA20', value: d.snapshot.ma20.ratio }, { label: 'MA60', value: d.snapshot.ma60.ratio }]) };
      },
    },
    {
      key: 'sentiment',
      title: '情绪与连板',
      path: '/analysis/chains',
      endpoint: 'sentiment',
      unit: '家',
      read: (d: any) => {
        if (!d.snapshot) throw new Error('情绪尚未就绪');
        const m = d.snapshot;
        return { text: `涨停 ${count(m.limitUp)} 家；跌停 ${count(m.limitDown)} 家；炸板 ${count(m.broken)} 家；最高连板 ${count(m.maxHeight)}。封板率 ${n(m.sealRate)}%。\n${(m.upgrades || []).map((u: any) => `${u.from} 进 ${u.from + 1}：${u.numerator}/${u.denominator}，晋级率 ${n(u.rate)}%`).join('\n')}`, points: points([{ label: '涨停', value: m.limitUp }, { label: '跌停', value: m.limitDown }, { label: '炸板', value: m.broken }]) };
      },
    },
    {
      key: 'feedback',
      title: '昨日强势股反馈',
      path: '/analysis/senti',
      endpoint: 'feedback',
      unit: '%',
      read: (d: any) => {
        if (!d.ready) throw new Error('强势股反馈尚未就绪');
        return { text: `样本日期 ${d.previousDate || '缺失'}。\n${d.groups.map((g: any) => `${g.name}：${g.ready ? `有效样本 ${g.sample}，平均涨幅 ${n(g.average)}%，上涨比例 ${n(g.riseRate)}%` : '数据未就绪'}`).join('\n')}`, points: points(d.groups.filter((g: any) => g.ready).map((g: any) => ({ label: g.name, value: g.average }))) };
      },
    },
    {
      key: 'sectors',
      title: '题材板块表现',
      path: '/analysis/sectors',
      endpoint: 'sectors',
      unit: '%',
      read: (d: any) => {
        const top = [...d.items].filter((i: any) => i.day !== null).sort((a: any, b: any) => b.day - a.day).slice(0, 8);
        if (!top.length) throw new Error('板块行情尚未就绪');
        return { text: top.map((i: any) => `${i.name}：当日 ${n(i.day)}%，5 日 ${n(i.five)}%，涨停 ${count(i.limitUp)} 家，最高 ${count(i.maxHeight)} 板。`).join('\n'), points: points(top.map((i: any) => ({ label: i.name, value: i.day }))) };
      },
    },
    {
      key: 'themes',
      title: '涨停题材与催化线索',
      path: '/analysis/limits',
      endpoint: 'theme-review',
      unit: '家',
      read: (d: any) => {
        if (!d.ready) throw new Error('题材复盘尚未就绪');
        return { text: `涨停 ${d.total} 家，已分类 ${d.classified} 家。题材解析需结合原文核验。\n${d.groups.slice(0, 8).map((g: any) => `${g.name}：${g.count} 家，最高 ${g.maxHeight} 板；${g.items.slice(0, 3).map((s: any) => `${s.name} ${s.tsCode}：${s.reason || '原因待核验'}`).join('；')}`).join('\n')}`, points: points(d.groups.slice(0, 8).map((g: any) => ({ label: g.name, value: g.count }))) };
      },
    },
    {
      key: 'dragon', title: '龙虎榜资金线索', path: '/analysis/dragon', endpoint: 'dragon-board', unit: '', read: (d: any) => ({ text: d.items.length ? d.items.slice(0, 10).map((i: any) => `${i.name} ${i.tsCode}：${i.reason}；净买入 ${n(i.netAmount)} 万元。`).join('\n') : '本次查询无龙虎榜记录，请到详情页核对资料状态。', points: [] }),
    },
    {
      key: 'news', title: '当日资讯', path: '/news', endpoint: 'news', unit: '', read: (d: any) => ({ text: d.items.length ? d.items.slice(0, 10).map((i: any) => `${i.publishedAt} ${i.title}\n来源：${i.sourceName}${i.originalUrl ? ` ${i.originalUrl}` : '，原文链接未提供'}`).join('\n\n') : '本次查询无资讯记录。', points: [] }),
    },
  ];
  const sections: Evidence[] = await Promise.all(definitions.map(async (def) => {
    const source = `${def.path}?date=${date}`;
    try {
      const response = def.endpoint === 'news'
        ? await request.get<any>('/news', {
          params: {
            range: 'date', date, page: 1, pageSize: 10,
          },
          autoShowError: false,
        })
        : await marketRequest<any>(def.endpoint, { date, ...(def.endpoint === 'sectors' ? { kind: 'N', period: 1 } : {}) }, { autoShowError: false });
      const { data } = response;
      if (def.key !== 'dragon' && data.date !== date) throw new Error('返回日期与所选日期不一致');
      return {
        key: def.key, title: def.title, source, unit: def.unit, state: 'ready' as const, ...def.read(data),
      };
    } catch (e) {
      return {
        key: def.key, title: def.title, source, unit: def.unit, state: 'missing' as const, text: e instanceof Error ? e.message.slice(0, 400) : '资料暂不可用', points: [],
      };
    }
  }));
  return { date, fetchedAt: new Date().toISOString(), sections };
}

export function researchDraft(research: Research, notes: Record<string, string> = {}, origin = '') {
  const ready = research.sections.filter((s) => s.state === 'ready');
  const missing = research.sections.filter((s) => s.state === 'missing');
  return [`# ${research.date} 市场复盘`, `复盘日期：${research.date}`, '## 市场与主线', ...ready.filter((s) => ['market', 'breadth', 'sentiment', 'feedback'].includes(s.key)).map((s) => `### ${s.title}\n${s.text}`), '## 题材与资金线索', ...ready.filter((s) => !['market', 'breadth', 'sentiment', 'feedback'].includes(s.key)).map((s) => `### ${s.title}\n${s.text}`), notes.themes || '', '## 今日观察与应对', notes.summary || '', '## 明日观察计划', notes.watch || '', '## 一条总结', notes.lesson || '', '## 资料来源与时间', `数据日期：${research.date}。资料读取时间：${research.fetchedAt}（不代表源数据更新时间）。`, ...research.sections.map((s) => `${s.title}：${origin ? new URL(s.source, origin).href : s.source}${s.state === 'missing' ? `；未取得：${s.text}` : ''}`), ...(missing.length ? ['部分资料缺失，以上为已取得事实；主线判断和后续观察需补充核验。'] : [])].join('\n\n');
}
