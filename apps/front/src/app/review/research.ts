import { marketRequest } from '@/api/market';
import { numberText } from '@/utils/format';
import { Evidence, Research } from './article-contract';

const n = (value: unknown) => numberText(value);
const count = (value: unknown) => numberText(value, 0);
const points = (items: { label: string; value: unknown }[]) => items.filter((p) => p.value !== null && p.value !== undefined && Number.isFinite(Number(p.value))).map((p) => ({ label: p.label, value: Number(p.value) }));
// Each source is independent: partial failures must not discard usable evidence.
export async function loadResearch(date: string, signal?: AbortSignal): Promise<Research> {
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
      title: '行业多周期对照',
      path: '/analysis/sectors',
      endpoint: 'sectors',
      unit: '%',
      read: (d: any) => {
        const rows = d.items.filter((i: any) => i.asOf === date);
        const ranked = (key: string) => [...rows].filter((i: any) => typeof i[key] === 'number' && Number.isFinite(i[key])).sort((a: any, b: any) => b[key] - a[key]);
        const selected = new Map<string, any>();
        ['day', 'five', 'twenty'].forEach((key) => ranked(key).slice(0, 2).forEach((row: any) => selected.set(row.code, row)));
        const divergence = ranked('twenty').slice(0, 10).filter((i: any) => typeof i.day === 'number' && i.day < 0).sort((a: any, b: any) => a.day - b.day)[0];
        if (divergence) selected.set(divergence.code, divergence);
        const weak = ranked('day').at(-1); if (weak) selected.set(weak.code, weak);
        const top = [...selected.values()].slice(0, 8);
        if (!top.length) throw new Error('板块行情尚未就绪');
        return { text: `行业精选${top.length}个（有效行业${rows.length}个）：三周期领先、强势回落和当日落后对照，非全市场排行。行业与涨停题材不可直接等同。\n${top.map((i: any) => `${i.name}：当日 ${n(i.day)}%，5 日 ${n(i.five)}%，20 日 ${n(i.twenty)}%，涨停 ${count(i.limitUp)} 家，最高 ${count(i.maxHeight)} 板。`).join('\n')}`, points: points(top.map((i: any) => ({ label: i.name, value: i.day }))) };
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

  ];
  const sections: Evidence[] = await Promise.all(definitions.map(async (def) => {
    const source = `${def.path}?date=${date}`;
    try {
      const response = await marketRequest<any>(def.endpoint, { date, ...(def.endpoint === 'sectors' ? { kind: 'I', period: 20 } : {}) }, { signal, autoShowError: false });
      const { data } = response;
      if (data.date !== date) throw new Error('返回日期与所选日期不一致');
      return {
        key: def.key, title: def.title, source, unit: def.unit, state: 'ready' as const, ...def.read(data),
      };
    } catch (e) {
      if (signal?.aborted) throw new DOMException('资料准备已停止', 'AbortError');
      return {
        key: def.key, title: def.title, source, unit: def.unit, state: 'missing' as const, text: e instanceof Error ? e.message.slice(0, 400) : '资料暂不可用', points: [],
      };
    }
  }));
  return { date, fetchedAt: new Date().toISOString(), sections };
}
