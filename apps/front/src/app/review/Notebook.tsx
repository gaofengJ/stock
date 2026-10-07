'use client';

/* eslint-disable react/jsx-indent, react/jsx-closing-tag-location -- Nested tab panel fragments use the repository's existing compact layout. */

import {
  ReactNode, useEffect, useRef, useState,
} from 'react';
import {
  Alert, Button, Card, Checkbox, Collapse, Input, Modal, Select, Space, Tabs, Tag,
} from 'antd';
import Link from 'next/link';
import request from '@/api/request';
import { errorMessage } from '@/api/errors';
import { copyText } from '@/utils/clipboard';
import { marketRequest, MarketStats, MarketBreadth } from '@/api/market';
import { numberText, beijingTime } from '@/utils/format';
import {
  emptyNotebook, internalFields, internalText, NotebookContent, noteHtml, publicFields, publicText, templateText,
} from './notebook-model';
import './notebook.css';

interface Snapshot { date: string; revision: number; content: NotebookContent | null; updatedAt?: string; previous: { date: string; revision: number; content: NotebookContent } | null; versions: { revision: number; createdAt: string }[]; publications: { id: number; revision: number; channel: string; url: string; body: string }[] }
const stages = [
  {
    title: '1 市场与主线', keys: ['marketJudgment'], optional: ['marketFacts', 'themes', 'dataState', 'yesterday'], links: [['/analysis/overview', '大盘概览'], ['/analysis/sectors', '板块分析'], ['/analysis/limits', '涨停复盘']], outcome: '今天适不适合出手？重点看哪个方向？各写一句即可。',
  },
  {
    title: '2 今日操作', keys: ['execution'], optional: ['toolEvidence'], links: [], outcome: '做了什么，是否按计划。没有交易就写等待。',
  },
  {
    title: '3 明日计划', keys: ['normalPlan'], optional: ['candidates', 'strongPlan', 'weakPlan'], links: [['/strategy', '策略选股'], ['/basic/stock/risk', '风险核验']], outcome: '持仓怎么处理；候选何时买、何时放弃。没有合适机会就等待。',
  },
  {
    title: '4 一条总结', keys: ['lesson'], optional: [], links: [], outcome: '今天最需要保留或改正的一件事。',
  },
];
function download(name: string, text: string, type = 'text/markdown;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function richCopy(text: string) {
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([noteHtml(text)], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })]);
    return true;
  } catch { return copyText(text); }
}

export default function Notebook({ date, renderTools, onDirty }: { date: string; renderTools: (capture: (text: string) => void) => ReactNode; onDirty: (value: boolean) => void }) {
  const [content, setContent] = useState<NotebookContent>(emptyNotebook);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('正在读取私人复盘');
  const [tab, setTab] = useState('write');
  const [preview, setPreview] = useState('');
  const [channel, setChannel] = useState<'wechat' | 'xueqiu'>('wechat');
  const [url, setUrl] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [dates, setDates] = useState<{ date: string; revision: number }[]>([]);
  const editCounter = useRef(0);
  useEffect(() => { onDirty(dirty); }, [dirty, onDirty]);
  useEffect(() => {
    let active = true;
    Promise.all([request.get<Snapshot>('/review/notebook', { params: { date }, autoShowError: false }), request.get<{ date: string; revision: number }[]>('/review/notebook/dates', { autoShowError: false })])
      .then(([r, d]) => { if (active) { setSnapshot(r.data); setContent(r.data.content || emptyNotebook()); setDates(d.data); setDirty(false); setError(''); setStatus(r.data.revision ? `已读取服务端版本 ${r.data.revision}` : '当天尚未保存'); } })
      .catch((e) => { if (active) { setError(errorMessage(e)); setStatus('读取失败，重试后可编辑'); } });
    return () => { active = false; };
  }, [date, attempt]);
  useEffect(() => {
    if (!dirty) return undefined;
    const leave = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    const block = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement)?.closest('a');
      if (anchor && anchor.target !== '_blank' && !window.confirm('尚有未保存内容，确定离开？')) { e.preventDefault(); e.stopPropagation(); }
    };
    window.addEventListener('beforeunload', leave); document.addEventListener('click', block, true);
    return () => { window.removeEventListener('beforeunload', leave); document.removeEventListener('click', block, true); };
  }, [dirty]);
  const change = (section: 'private' | 'public', key: string, value: string) => {
    editCounter.current += 1; setContent((old) => ({ ...old, [section]: { ...old[section], [key]: value } })); setDirty(true); setConfirmed(false);
  };
  const save = async () => {
    if (!snapshot || busy) return;
    setBusy(true); setError(''); const edit = editCounter.current;
    try {
      const r = await request.post<{ revision: number }>('/review/notebook', { date, revision: snapshot.revision, content: JSON.stringify(content) }, { autoShowError: false });
      setSnapshot((old) => old && ({ ...old, revision: r.data.revision, versions: [{ revision: r.data.revision, createdAt: new Date().toISOString() }, ...old.versions] }));
      if (editCounter.current === edit) setDirty(false);
      setStatus(`已保存服务端版本 ${r.data.revision}`);
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };
  const inspectVersion = async (revision: number) => {
    try { const r = await request.get<Snapshot>('/review/notebook', { params: { date, revision }, autoShowError: false }); setPreview(internalText(date, r.data.content!)); } catch (e) { setError(errorMessage(e)); }
  };
  const record = async () => {
    if (!snapshot || dirty || !confirmed) return;
    setBusy(true);
    try {
      await request.post('/review/notebook/publications', {
        date, revision: snapshot.revision, channel, url,
      }, { autoShowError: false });
      const r = await request.get<Snapshot>('/review/notebook', { params: { date }, autoShowError: false }); setSnapshot(r.data); setUrl(''); setStatus('已记录文章链接与对应版本；此操作不会代替平台发布。');
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };
  const publicReady = !!content.public.summary.trim() && !!content.public.sources.trim();
  const importMarket = async () => {
    if (!snapshot) return;
    setBusy(true);
    try {
      const r = await marketRequest<{ date: string; market: MarketStats | null; breadth: MarketBreadth | null }>('candidate-environment', { date }, { autoShowError: false });
      if (r.data.date !== date || !r.data.market) throw new Error('所选日期的市场数据尚未就绪，不带入其他日期。');
      const m = r.data.market;
      const evidence = `交易日期：${date}；查询时间：${beijingTime(new Date().toISOString())}。\n来源：大盘环境，全市场口径。\n上涨 ${m.up} 家，下跌 ${m.down} 家，平盘 ${m.flat} 家；成交额 ${numberText(m.amount)} 亿元。\n涨停 ${m.limitUp} 家，跌停 ${m.limitDown} 家；最高连板 ${m.maxHeight}。\nMA20上方占比 ${numberText(r.data.breadth?.ma20.ratio)}%；MA60上方占比 ${numberText(r.data.breadth?.ma60.ratio)}%。\n缺失值显示为“—”，查询时间不代表源数据更新时间。`;
      change('private', 'marketFacts', `${content.private.marketFacts}${content.private.marketFacts ? '\n\n' : ''}${evidence}`.slice(0, 4000));
      setStatus('市场数据已带入事实栏，请补充变化与判断后保存。');
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };
  const renderField = (key: string) => {
    const field = internalFields.find(([k]) => k === key)!;
    return (
      <div className="notebook-field" key={key}>
        <label htmlFor={`note-${key}`}>{field[1]}</label>
        <Input.TextArea id={`note-${key}`} disabled={!snapshot} value={content.private[key]} placeholder={field[2]} rows={3} maxLength={key === 'toolEvidence' ? 12000 : 4000} onChange={(e) => change('private', key, e.target.value)} />
      </div>
    );
  };
  const article = publicText(date, content, channel);
  return (
    <div className="review-notebook">
      <div className="notebook-toolbar">
        <Space wrap>
          <Tag>私人复盘</Tag>
          <span role="status">{dirty ? '有未保存修改' : status}</span>
          <Button type="primary" loading={busy} disabled={!snapshot || !dirty} onClick={save}>保存复盘版本</Button>
        </Space>
        <Space wrap>
          <Button onClick={() => download(`私人复盘-${date}.md`, internalText(date, content))}>导出内部笔记</Button>
          <Button onClick={async () => setStatus(await richCopy(templateText()) ? '模板已复制，可粘贴到飞书。' : '复制失败，请下载模板。')}>复制飞书模板</Button>
          <Button onClick={() => download('每日交易复盘模板.html', `<!doctype html><meta charset="utf-8">${noteHtml(templateText())}`, 'text/html;charset=utf-8')}>下载模板</Button>
        </Space>
      </div>
      {error && <Alert type="error" message={error} action={<Button onClick={() => { if (!dirty || window.confirm('请先导出本地笔记。重新加载将放弃未保存修改，是否继续？')) setAttempt((x) => x + 1); }}>重新加载</Button>} />}
      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          {
            key: 'write',
            label: '完成今日复盘',
            children: <>
              {snapshot?.previous && (
              <Collapse items={[{
                key: 'previous',
                label: `上次记录：${snapshot.previous.date}，版本 ${snapshot.previous.revision}`,
                children: <>
                  <p>对照原计划验证，不自动复制为今日判断。</p>
                  <pre className="notebook-text">{['marketJudgment', 'themes', 'normalPlan', 'strongPlan', 'weakPlan'].map((k) => `${internalFields.find(([key]) => key === k)?.[1]}：\n${snapshot.previous!.content.private[k] || '未填写'}`).join('\n\n')}</pre>
                </>,
              }]}
              />
              )}
              <div className="notebook-stages">
                {stages.map((stage) => (
                  <Card key={stage.title} title={stage.title}>
                    <p className="review-caption">{stage.outcome}</p>
                    <Space wrap className="notebook-links">
                      {stage.links.map(([path, label]) => <Link key={path} href={`${path}?date=${date}`} target="_blank" rel="noopener noreferrer">{label}</Link>)}
                      {(stage.keys.includes('execution') || stage.keys.includes('normalPlan')) && <Button type="link" onClick={() => setTab('tools')}>使用候选与持仓工具</Button>}
                    </Space>
                    {stage.keys.includes('marketJudgment') && <Button disabled={!snapshot} loading={busy} onClick={importMarket}>带入所选日期的市场事实</Button>}
                    {stage.keys.map(renderField)}
                    {stage.optional.length > 0 && <Collapse ghost items={[{ key: 'detail', label: '补充细节（可选）', children: stage.optional.map(renderField) }]} />}
                  </Card>
                ))}
              </div>
              <Space wrap>
                <Button type="primary" disabled={!snapshot || !dirty} loading={busy} onClick={save}>保存复盘版本</Button>
                <Button onClick={() => setPreview(internalText(date, content))}>预览内部笔记</Button>
                <Button onClick={() => setTab('public')}>整理公开笔记</Button>
              </Space>
                      </>,
          },
          {
            key: 'tools', label: '候选与持仓工具', forceRender: true, children: renderTools((text) => { if (!snapshot) { setError('请先加载私人复盘记录，再带入工具快照。'); return; } change('private', 'toolEvidence', text.slice(0, 12000)); setTab('write'); setStatus('工具快照已带入内部记录，请保存。'); }),
          },
          {
            key: 'public',
            label: '飞书文档与公开稿',
            children: <>
              <Alert type="info" message="公开稿单独编辑，只使用下方字段。内部持仓、成交、盈亏和执行记录不会自动带入。" />
              <div className="notebook-public-grid">
                {publicFields.map(([key, label, hint]) => (
                  <div className="notebook-field" key={key}>
                    <label htmlFor={`public-${key}`}>{label}</label>
                    <Input.TextArea id={`public-${key}`} disabled={!snapshot} value={content.public[key]} placeholder={hint} rows={key === 'title' ? 1 : 4} maxLength={4000} showCount onChange={(e) => change('public', key, e.target.value)} />
                  </div>
                ))}
              </div>
              <Space wrap>
                <Select aria-label="公开稿渠道" value={channel} onChange={(v) => { setChannel(v); setConfirmed(false); }} options={[{ value: 'wechat', label: '公众号完整稿' }, { value: 'xueqiu', label: '雪球简版' }]} />
                <Button disabled={!publicReady} onClick={() => setPreview(article)}>预览公开稿</Button>
              </Space>
              <div className="notebook-field"><Checkbox checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)}>已检查公开稿，确认没有个人信息或私人交易记录</Checkbox></div>
              <Space wrap>
                <Button disabled={!confirmed || !publicReady} onClick={async () => setStatus(await richCopy(article) ? '公开稿已复制，可粘贴到飞书云文档，再由你手动发布。' : '复制失败，请下载排版稿。')}>复制公开稿到飞书</Button>
                <a href="https://www.feishu.cn/drive/" target="_blank" rel="noopener noreferrer">打开飞书云文档</a>
                <Button disabled={!confirmed || !publicReady} onClick={() => download(`${date}-${channel}.html`, `<!doctype html><meta charset="utf-8">${noteHtml(article)}`, 'text/html;charset=utf-8')}>下载排版稿</Button>
                <Button disabled={!confirmed || !publicReady} onClick={() => download(`${date}-${channel}.md`, article)}>下载 Markdown</Button>
                <a href={channel === 'wechat' ? 'https://mp.weixin.qq.com/' : 'https://xueqiu.com/'} target="_blank" rel="noopener noreferrer">打开发布平台</a>
              </Space>
              <Card title="发布后记录" className="notebook-publish">
                <p>在对应平台完成发布后，粘贴文章链接。保存的记录包含当前版本公开稿，不包含内部笔记。</p>
                <Space.Compact block>
                  <Input aria-label="已发布文章链接" placeholder="https://…" value={url} maxLength={1500} onChange={(e) => setUrl(e.target.value)} />
                  <Button disabled={!confirmed || !publicReady || dirty || !snapshot?.revision || !url} loading={busy} onClick={record}>记录发布链接</Button>
                </Space.Compact>
                {dirty && <p className="review-caption">请先保存当前版本，再记录发布链接。</p>}
                {snapshot?.publications.map((p) => (
                  <p key={p.id}>
                    <a href={p.url} target="_blank" rel="noopener noreferrer">
                      {p.channel === 'wechat' ? '公众号' : '雪球'}
                      文章
            </a>
                    {`，复盘版本 ${p.revision} `}
                    <Button type="link" onClick={() => setPreview(p.body)}>查看发布快照</Button>
                  </p>
                ))}
              </Card>
                      </>,
          },
          {
            key: 'history',
            label: '历史记录',
            children: <>
              <p>版本只读，保留当时计划；修改后保存会产生新版本。</p>
              <Space wrap>{snapshot?.versions.map((v) => <Button key={v.revision} onClick={() => inspectVersion(v.revision)}>{`查看版本 ${v.revision}`}</Button>)}</Space>
              <div className="notebook-history">{dates.map((d) => <Link key={d.date} href={`/review?date=${d.date}`} target="_blank" rel="noopener noreferrer">{`${d.date}，版本 ${d.revision}`}</Link>)}</div>
                      </>,
          },
        ]}
      />
      <Modal open={!!preview} title="笔记预览" width={850} onCancel={() => setPreview('')} footer={<Button onClick={() => setPreview('')}>关闭</Button>}><pre className="notebook-text">{preview}</pre></Modal>
    </div>
  );
}
