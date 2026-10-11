'use client';

/* eslint-disable react/jsx-indent, react/jsx-closing-tag-location -- Nested tab panel fragments use the repository's existing compact layout. */

import {
  ReactNode, useEffect, useRef, useState,
} from 'react';
import {
  Alert, Button, Card, Checkbox, Collapse, Empty, Input, Modal, Select, Space, Tabs, Tag,
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
import { eveningFlow } from './evening-flow';

interface Snapshot { date: string; revision: number; content: NotebookContent | null; updatedAt?: string; previous: { date: string; revision: number; content: NotebookContent } | null; versions: { revision: number; createdAt: string }[]; publications: { id: number; revision: number; channel: string; url: string; body: string }[] }
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
        <Space wrap size={12}>
          <Tag>私人复盘</Tag>
          <span role="status">{dirty ? '有未保存修改' : status}</span>
          <Button type="primary" loading={busy} disabled={!snapshot || !dirty} onClick={save}>保存复盘版本</Button>
        </Space>
        <Space wrap size={8}>
          <Button onClick={() => download(`私人复盘-${date}.md`, internalText(date, content))}>导出内部笔记</Button>
          <Button onClick={async () => setStatus(await richCopy(templateText()) ? '模板已复制，可粘贴到飞书。' : '复制失败，请下载模板。')}>复制私人复盘模板</Button>
          <Button onClick={() => download('私人每日复盘模板.html', `<!doctype html><meta charset="utf-8">${noteHtml(templateText())}`, 'text/html;charset=utf-8')}>下载模板</Button>
        </Space>
      </div>
      {error && <Alert type="error" message={error} action={<Button onClick={() => { if (!dirty || window.confirm('请先导出本地笔记。重新加载将放弃未保存修改，是否继续？')) setAttempt((x) => x + 1); }}>重新加载</Button>} />}
      <Tabs
        className="notebook-tabs"
        activeKey={tab}
        onChange={setTab}
        items={[
          {
            key: 'write',
            label: '完成今日复盘',
            children: <div className="notebook-panel">
              <div className="notebook-start">
                <h2>今晚按这四步完成，约 60 分钟</h2>
                <p>每天在这里做复盘；交易体系用于查规则，复盘导图用于查方法。判断与计划只记在当天笔记中。</p>
                <nav className="notebook-flow" aria-label="晚间复盘四步">
                  {eveningFlow.map((stage) => (
                    <Button key={stage.id} onClick={() => document.getElementById(`evening-${stage.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
                      <span>{stage.title}</span>
                      <span className="review-caption">{stage.time}</span>
                    </Button>
                  ))}
                </nav>
                <Link href="/trading-system/" target="_blank" rel="noopener noreferrer">查看交易规则与复盘方法</Link>
              </div>
              <div className="notebook-stages">
                {eveningFlow.map((stage) => (
                  <Card id={`evening-${stage.id}`} key={stage.id} title={stage.title} extra={stage.time}>
                    <ul className="notebook-questions">{stage.questions.map((question) => <li key={question}>{question}</li>)}</ul>
                    <p className="notebook-outcome">{stage.outcome}</p>
                    {(stage.links.length > 0 || stage.id === 'execution') && (
                    <Space wrap size={12} className="notebook-links">
                      {stage.links.map(([path, label]) => <Link key={path} href={`${path}?date=${date}`} target="_blank" rel="noopener noreferrer">{label}</Link>)}
                      {(stage.id === 'execution' || stage.id === 'candidates') && <Button type="link" onClick={() => setTab('tools')}>使用候选与持仓工具</Button>}
                      {stage.keys.includes('marketJudgment') && <Button disabled={!snapshot} loading={busy} onClick={importMarket}>带入所选日期的市场事实</Button>}
                    </Space>
                    )}
                    {stage.id === 'execution' && (
<>
              {snapshot?.previous && (
              <Collapse
                className="notebook-previous"
                defaultActiveKey={['previous']}
                items={[{
                  key: 'previous',
                  label: `上次记录：${snapshot.previous.date}，版本 ${snapshot.previous.revision}`,
                  children: <>
                  <p>对照原计划验证，不自动复制为今日判断。</p>
                  <pre className="notebook-text">{['marketJudgment', 'themes', 'normalPlan', 'strongPlan', 'weakPlan'].map((k) => `${internalFields.find(([key]) => key === k)?.[1]}：\n${snapshot.previous!.content.private[k] || '未填写'}`).join('\n\n')}</pre>
                </>,
                }]}
              />
              )}
                      {snapshot && !snapshot.previous && <p className="review-caption">尚无此前保存的计划。从今晚开始记录，不事后补写昨日预期。</p>}
                    </>
                    )}
                    {stage.keys.map(renderField)}
                    {stage.optional.length > 0 && <Collapse className="notebook-details" ghost items={[{ key: 'detail', label: '补充细节（可选）', children: <div className="notebook-detail-fields">{stage.optional.map(renderField)}</div> }]} />}
                  </Card>
                ))}
              </div>
              <Space wrap size={12} className="notebook-actions">
                <Button type="primary" disabled={!snapshot || !dirty} loading={busy} onClick={save}>保存复盘版本</Button>
                <Button onClick={() => setPreview(internalText(date, content))}>预览内部笔记</Button>
                <Button onClick={() => setTab('public')}>整理公开笔记</Button>
              </Space>
                      </div>,
          },
          {
            key: 'tools',
            label: '辅助工具',
            forceRender: true,
            children: <div className="notebook-panel">
              <div className="notebook-panel-intro">
              <p>看图、核验风险或分析持仓后，将快照带回今日笔记。这里的观察名单不等于明日买入计划。</p>
              <Button onClick={() => setTab('write')}>返回晚间四步</Button>
              </div>
              <div className="notebook-tools">
              {renderTools((text) => { if (!snapshot) { setError('请先加载私人复盘记录，再带入工具快照。'); return; } change('private', 'toolEvidence', text.slice(0, 12000)); setTab('write'); setStatus('工具快照已带入内部记录，请保存。'); })}
              </div>
</div>,
          },
          {
            key: 'public',
            label: '复盘后整理文章',
            children: <div className="notebook-panel">
              <div className="notebook-panel-intro">
              <p>先保存私人复盘，再整理下方可公开内容。网站负责记录与导出；调用 stock-review-feishu Skill 后才会创建飞书文档，公众号与雪球由你手动发布。</p>
              <Button onClick={async () => setStatus(await copyText(`使用 $stock-review-feishu 生成 ${date} 的复盘文章。读取网站当天公开字段及已核实的市场数据，按已配置的飞书模板保存至复盘目录；不要读取或转写私人操作、持仓和盈亏。`) ? '调用说明已复制，请在 Codex 中发送；尚未创建飞书文档。' : '复制失败，请手动输入：用复盘 Skill 生成指定日期的文章。')}>复制 Skill 调用说明</Button>
              </div>
              <Alert type="info" message="公开稿单独编辑，只使用下方字段。内部持仓、成交、盈亏和执行记录不会自动带入。" />
              <div className="notebook-public-grid">
                {publicFields.map(([key, label, hint]) => (
                  <div className="notebook-field" key={key}>
                    <label htmlFor={`public-${key}`}>{label}</label>
                    <Input.TextArea id={`public-${key}`} disabled={!snapshot} value={content.public[key]} placeholder={hint} rows={key === 'title' ? 1 : 4} maxLength={4000} showCount onChange={(e) => change('public', key, e.target.value)} />
                  </div>
                ))}
              </div>
              <div className="notebook-public-actions">
              <Space wrap size={12}>
                <Select aria-label="公开稿渠道" value={channel} onChange={(v) => { setChannel(v); setConfirmed(false); }} options={[{ value: 'wechat', label: '公众号' }, { value: 'xueqiu', label: '雪球' }]} />
                <Button disabled={!publicReady} onClick={() => setPreview(article)}>预览公开稿</Button>
              </Space>
              <Checkbox checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)}>已检查公开稿，确认没有个人信息或私人交易记录</Checkbox>
              <Space wrap size={12}>
                <Button disabled={!confirmed || !publicReady} onClick={async () => setStatus(await richCopy(article) ? '公开稿已复制，可粘贴到飞书云文档，再由你手动发布。' : '复制失败，请下载排版稿。')}>复制公开稿到飞书</Button>
                <a href="https://www.feishu.cn/drive/" target="_blank" rel="noopener noreferrer">打开飞书云文档</a>
                <Button disabled={!confirmed || !publicReady} onClick={() => download(`${date}-${channel}.html`, `<!doctype html><meta charset="utf-8">${noteHtml(article)}`, 'text/html;charset=utf-8')}>下载排版稿</Button>
                <Button disabled={!confirmed || !publicReady} onClick={() => download(`${date}-${channel}.md`, article)}>下载 Markdown</Button>
                <a href={channel === 'wechat' ? 'https://mp.weixin.qq.com/' : 'https://xueqiu.com/'} target="_blank" rel="noopener noreferrer">打开发布平台</a>
              </Space>
              </div>
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
                      </div>,
          },
          {
            key: 'history',
            label: '历史记录',
            children: <div className="notebook-panel">
              <p>版本只读，保留当时计划；修改后保存会产生新版本。</p>
              <section className="notebook-history-section">
                <h2>当前日期的版本</h2>
                {snapshot?.versions.length ? <Space wrap size={12}>{snapshot.versions.map((v) => <Button key={v.revision} onClick={() => inspectVersion(v.revision)}>{`查看版本 ${v.revision}`}</Button>)}</Space> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前日期尚无保存版本" />}
              </section>
              <section className="notebook-history-section">
                <h2>已保存的复盘日期</h2>
                {dates.length ? (
                  <div className="notebook-history">
                    {dates.map((d) => (
                      <Link key={d.date} href={`/review?date=${d.date}`} target="_blank" rel="noopener noreferrer">
                        <span>{d.date}</span>
                        <span className="review-caption">{`版本 ${d.revision}`}</span>
                      </Link>
                    ))}
                  </div>
                ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="尚无历史复盘记录" />}
              </section>
                      </div>,
          },
        ]}
      />
      <Modal className="notebook-preview-modal" open={!!preview} title="笔记预览" width={850} destroyOnClose onCancel={() => setPreview('')} footer={<Button onClick={() => setPreview('')}>关闭</Button>}><pre className="notebook-text">{preview}</pre></Modal>
    </div>
  );
}
