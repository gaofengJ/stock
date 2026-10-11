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
import { numberText } from '@/utils/format';
import ArticleEditor from './ArticleEditor';
import Holdings from './Holdings';
import { loadResearch } from './research';
import {
  emptyNotebook, internalFields, internalText, NotebookContent, noteHtml, templateText,
  publicText,
} from './notebook-model';
import './notebook.css';
import { eveningFlow } from './evening-flow';
import { ArticleImage } from './article-contract';

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

export default function Notebook({ date, renderTools, onDirty }: { date: string; renderTools: (capture: (text: string) => void, onSelection: (items: string[]) => void) => ReactNode; onDirty: (value: boolean) => void }) {
  const [content, setContent] = useState<NotebookContent>(emptyNotebook);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('正在读取私人复盘');
  const [tab, setTab] = useState('write');
  const [preview, setPreview] = useState('');
  const [previewImages, setPreviewImages] = useState<ArticleImage[]>([]);
  const [previewRich, setPreviewRich] = useState(false);
  const [holdings, setHoldings] = useState<any>(null);
  const [candidateNames, setCandidateNames] = useState<string[]>([]);
  const [researchBusy, setResearchBusy] = useState(false);
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
      setSnapshot((old) => old && ({
        ...old, revision: r.data.revision, content, versions: [{ revision: r.data.revision, createdAt: new Date().toISOString() }, ...old.versions],
      }));
      if (editCounter.current === edit) setDirty(false);
      setDates((old) => [{ date, revision: r.data.revision }, ...old.filter((item) => item.date !== date)].sort((a, b) => b.date.localeCompare(a.date)));
      setStatus(`已保存服务端版本 ${r.data.revision}`);
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };
  const inspectVersion = async (revision: number, illustrated = false) => {
    try { const r = await request.get<Snapshot>('/review/notebook', { params: { date, revision }, autoShowError: false }); setPreviewRich(illustrated); setPreviewImages(r.data.content?.article?.images || []); setPreview(illustrated ? publicText(date, r.data.content!, 'wechat') : internalText(date, r.data.content!)); } catch (e) { setError(errorMessage(e)); }
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
  const publicSource: Record<string, string> = { market: 'marketJudgment', themes: 'themes', plan: 'lesson' };
  const publicReady = !!content.article?.body.trim() || (!!content.public.summary.trim() && !!content.public.sources.trim());
  const importMarket = async () => {
    if (!snapshot) return;
    setResearchBusy(true);
    try {
      const research = await loadResearch(date);
      editCounter.current += 1; setContent((old) => ({ ...old, research })); setDirty(true);
      setStatus(`已读取 ${research.sections.filter((item) => item.state === 'ready').length}/${research.sections.length} 类当日资料；缺失项可重试，判断仍由你填写。`);
    } catch (e) { setError(errorMessage(e)); } finally { setResearchBusy(false); }
  };
  const renderField = (key: string) => {
    const field = internalFields.find(([k]) => k === key)!;
    return (
      <div className="notebook-field" key={key}>
        <label htmlFor={`note-${key}`}>{field[1]}</label>
        <Input.TextArea id={`note-${key}`} disabled={!snapshot} value={content.private[key]} placeholder={field[2]} rows={3} maxLength={['toolEvidence', 'holdingEvidence'].includes(key) ? 12000 : 4000} onChange={(e) => change('private', key, e.target.value)} />
      </div>
    );
  };
  return (
    <div className="review-notebook">
      <div className="notebook-toolbar">
        <Space wrap size={12}>
          <Tag>私人复盘</Tag>
          {!!snapshot?.revision && <Tag>{`版本 ${snapshot.revision}`}</Tag>}
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
                <h2>从当日资料到下一交易日计划</h2>
                <p>按下面五步完成研究与记录。市场资料可以统一读取，候选和持仓工具就在对应步骤中。</p>
                <nav className="notebook-flow" aria-label="每日复盘五步">
                  {eveningFlow.map((stage) => (
                    <Button key={stage.id} onClick={() => document.getElementById(`evening-${stage.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
                      <span>{stage.title}</span>
                      <span className="review-caption">{stage.time}</span>
                    </Button>
                  ))}
                </nav>
                <Space wrap size={12}>
<Button disabled={!snapshot} loading={researchBusy} onClick={importMarket}>{content.research ? '更新当日资料' : '读取当日资料'}</Button>
<Link href="/trading-system/" target="_blank" rel="noopener noreferrer">查看交易规则与复盘方法</Link>
</Space>
                {content.research && <p className="review-caption">{`资料日期 ${content.research.date}；读取时间 ${content.research.fetchedAt}。缺失项不会用其他日期替代。`}</p>}
              </div>
              <div className="notebook-stages">
                {eveningFlow.map((stage) => (
                  <Card id={`evening-${stage.id}`} key={stage.id} title={stage.title} extra={stage.time}>
                    <ul className="notebook-questions">{stage.questions.map((question) => <li key={question}>{question}</li>)}</ul>
                    <p className="notebook-outcome">{stage.outcome}</p>
                    {(stage.links.length > 0 || stage.id === 'execution') && (
                    <Space wrap size={12} className="notebook-links">
                      {stage.links.map(([path, label]) => <Link key={path} href={`${path}?date=${date}`} target="_blank" rel="noopener noreferrer">{label}</Link>)}

                    </Space>
                    )}
                    {content.research && stage.evidence.length > 0 && (
<div className="notebook-evidence-grid">
{content.research.sections.filter((item) => stage.evidence.includes(item.key)).map((item) => (
<section key={item.key} className="notebook-evidence">
<strong>{item.title}</strong>
<Tag color={item.state === 'ready' ? 'green' : 'orange'}>{item.state === 'ready' ? '已取得' : '暂缺'}</Tag>
<pre className="notebook-text">{item.text}</pre>
<Link href={item.source} target="_blank" rel="noopener noreferrer">打开完整资料</Link>
</section>
))}
</div>
                    )}
                    {stage.id === 'candidates' && <div className="notebook-tools">{renderTools((text) => { change('private', 'toolEvidence', text.slice(0, 12000)); setStatus('候选研究已带入当天笔记，请保存版本。'); }, setCandidateNames)}</div>}
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
                    {stage.id === 'execution' && (
<Collapse items={[{
  key: 'holdings',
  label: '检查已有持仓（可选）',
  children: <div className="notebook-detail-fields">
<Holdings date={date} candidates={candidateNames} onResult={setHoldings} />
<Button disabled={!snapshot || !holdings} onClick={() => { change('private', 'holdingEvidence', holdings.items.map((r: any) => `${r.name} ${r.code}：持有 ${r.heldDays ?? '未知'} 个交易日；收盘 ${numberText(r.close)} 元；成本价格差 ${numberText(r.profitPct)}%；${r.ma5.label}。原理由：${r.rationale || '未提供'}。${r.timeReview || ''}`).join('\n')); setStatus('持仓分析已带入私人记录，请保存。'); }}>将分析结果记入私人笔记</Button>
</div>,
}]}
/>
                    )}
                    {stage.keys.map(renderField)}
                    {['market', 'themes', 'plan'].includes(stage.id) && (
<Button disabled={!snapshot || !content.private[publicSource[stage.id]]?.trim()} onClick={() => { const key = publicSource[stage.id]; const publicKey = stage.id === 'market' ? 'summary' : key; if (window.confirm('这段文字将作为公开文章素材。请确认不含个人操作、持仓或盈亏。继续？')) { change('public', publicKey, content.private[key]); setStatus('已选为公开素材。进入图文成稿，生成初稿时会一并带入。'); } }}>
将
{stage.id === 'plan' ? '经验总结' : '研究结论'}
选为公开素材
</Button>
                    )}
                    {stage.optional.length > 0 && <Collapse className="notebook-details" ghost items={[{ key: 'detail', label: '补充细节（可选）', children: <div className="notebook-detail-fields">{stage.optional.map(renderField)}</div> }]} />}
                  </Card>
                ))}
              </div>
              <Space wrap size={12} className="notebook-actions">
                <Button type="primary" disabled={!snapshot || !dirty} loading={busy} onClick={save}>保存复盘版本</Button>
                <Button onClick={() => { setPreviewRich(false); setPreview(internalText(date, content)); }}>预览内部笔记</Button>
                <Button onClick={() => setTab('public')}>整理图文成稿</Button>
              </Space>
                      </div>,
          },
          {
            key: 'public',
            label: '图文成稿',
            children: <div className="notebook-panel">
              <ArticleEditor date={date} revision={snapshot?.revision || 0} content={content} disabled={!snapshot} dirty={dirty} onStatus={setStatus} onChange={(article) => { editCounter.current += 1; setContent((old) => ({ ...old, article })); setDirty(true); setConfirmed(false); }} />
              <Space wrap size={12}><Button type="primary" disabled={!snapshot || !dirty} loading={busy} onClick={save}>保存图文版本</Button></Space>
              <Card title="发布后记录" className="notebook-publish">
                <p>在对应平台完成发布后，粘贴文章链接。保存的记录包含当前版本公开稿，不包含内部笔记。</p>
                <Space wrap size={12}>
<Select aria-label="已发布渠道" value={channel} onChange={setChannel} options={[{ value: 'wechat', label: '公众号' }, { value: 'xueqiu', label: '雪球' }]} />
<Checkbox checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)}>已核对文章与公开范围</Checkbox>
</Space>
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
                    <Button type="link" onClick={() => { setPreviewRich(true); setPreviewImages([]); setPreview(p.body); }}>查看发布快照</Button>
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
                {snapshot?.versions.length ? (
<Space wrap size={12}>
{snapshot.versions.map((v) => (
<Space key={v.revision}>
<Button onClick={() => inspectVersion(v.revision)}>{`版本 ${v.revision} 私人笔记`}</Button>
<Button onClick={() => inspectVersion(v.revision, true)}>{`版本 ${v.revision} 图文`}</Button>
</Space>
))}
</Space>
                ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前日期尚无保存版本" />}
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
      <Modal className="notebook-preview-modal" open={!!preview} title="笔记预览" width={850} destroyOnClose onCancel={() => setPreview('')} footer={<Button onClick={() => setPreview('')}>关闭</Button>}>
        {previewRich ? <div className="notebook-article-preview" dangerouslySetInnerHTML={{ __html: noteHtml(preview, previewImages) }} /> : <pre className="notebook-text">{preview}</pre>}
      </Modal>
    </div>
  );
}
