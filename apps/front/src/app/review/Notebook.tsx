'use client';

/* eslint-disable react/jsx-indent, react/jsx-closing-tag-location -- Nested tab panel fragments use the repository's existing compact layout. */

import {
  ReactNode, useCallback, useEffect, useRef, useState,
} from 'react';
import {
  Alert, Button, Card, Checkbox, Collapse, Empty, Input, Modal, Space, Tabs, Tag,
} from 'antd';
import Link from 'next/link';
import request from '@/api/request';
import { errorMessage } from '@/api/errors';
import ArticleEditor from './ArticleEditor';
import InvestmentCalendar from '../basic/components/InvestmentCalendar';
import { Materials, emptyMaterials, validateMaterials } from './materials-contract';
import { loadResearch } from './research';
import {
  emptyNotebook, internalFields, internalText, NotebookContent, noteHtml,
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

export default function Notebook({ date, renderTools, onDirty }: { date: string; renderTools: (capture: (text: string) => void, onSelection?: (items: string[]) => void) => ReactNode; onDirty: (value: boolean) => void }) {
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
  const [calendarDate, setCalendarDate] = useState(date);
  const [researchBusy, setResearchBusy] = useState(false);
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
    editCounter.current += 1; setContent((old) => ({ ...old, [section]: { ...old[section], [key]: value } })); setDirty(true);
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
  const captureCandidates = useCallback((text: string) => { editCounter.current += 1; setContent((old) => ({ ...old, private: { ...old.private, toolEvidence: text.slice(0, 24000) } })); setDirty(true); }, []);
  const materials = content.materials || emptyMaterials();
  const changeMaterials = (value: Materials) => {
    try { const next = validateMaterials(value); editCounter.current += 1; setContent((old) => ({ ...old, materials: next })); setDirty(true); } catch (e) { setError((e as Error).message); }
  };
  const importMarket = async () => {
    if (!snapshot) return;
    setResearchBusy(true);
    try {
      const research = await loadResearch(date);
      editCounter.current += 1; setContent((old) => ({ ...old, research })); setDirty(true);
      setStatus(`已读取 ${research.sections.filter((item) => item.state === 'ready').length}/${research.sections.length} 类当日资料；缺失项可重试，你的判断可留空，交给 Skill 补充分析。`);
    } catch (e) { setError(errorMessage(e)); } finally { setResearchBusy(false); }
  };
  const renderField = (key: string) => {
    const field = internalFields.find(([k]) => k === key)!;
    return (
      <div className="notebook-field" key={key}>
        <label htmlFor={`note-${key}`}>{field[1]}</label>
        <Input.TextArea id={`note-${key}`} disabled={!snapshot} value={content.private[key]} placeholder={`${field[2]} 你的原文会保留。`} autoSize={{ minRows: key === 'lesson' ? 4 : 2 }} maxLength={({ toolEvidence: 24000, holdingEvidence: 12000 } as Record<string, number>)[key] || 4000} onChange={(e) => change('private', key, e.target.value)} />
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
          <Button type="primary" loading={busy} disabled={!snapshot || !dirty} onClick={save}>保存记录</Button>
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
            label: '复盘记录',
            children: <div className="notebook-panel">
              <div className="notebook-start">
                <h2>看资料，记判断，留素材</h2>
                <p>按四步回顾当天，文字都可以留空。网站保存记录和素材，后续由 Skill 补充分析并生成飞书图文。</p>
                <nav className="notebook-flow" aria-label="每日复盘四步">
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
                    <p className="review-caption">{stage.guidance}</p>
                    {stage.links.length > 0 && (
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
                    {stage.id === 'themes' && (
                      <div className="notebook-detail-fields">
                        <Checkbox disabled={!snapshot} checked={materials.showCalendar} onChange={(e) => changeMaterials({ ...materials, showCalendar: e.target.checked })}>显示投资日历</Checkbox>
                        {materials.showCalendar && <InvestmentCalendar date={calendarDate} onDate={setCalendarDate} selected={materials.calendar} onSelect={(calendar) => changeMaterials({ ...materials, calendar })} />}
                        {!!materials.calendar.length && <p className="review-caption">{`已选 ${materials.calendar.length} 项日历素材，可在图文素材中查看或移除。关闭日历不会删除已选事件。`}</p>}
                      </div>
                    )}
                    {stage.id === 'candidates' && snapshot && <div className="notebook-tools">{renderTools(captureCandidates, undefined)}</div>}
                    {stage.id === 'execution' && snapshot?.previous && (
                      <Collapse items={[{ key: 'previous', label: `回看上次记录：${snapshot.previous.date}`, children: <pre className="notebook-text">{internalText(snapshot.previous.date, snapshot.previous.content)}</pre> }]} />
                    )}
                    {stage.keys.map(renderField)}
                    {stage.optional.length > 0 && <Collapse className="notebook-details" ghost items={[{ key: 'detail', label: '补充细节（可选）', children: <div className="notebook-detail-fields">{stage.optional.map(renderField)}</div> }]} />}
                  </Card>
                ))}
              </div>
              {['toolEvidence', 'candidates', 'normalPlan', 'strongPlan', 'weakPlan', 'holdingEvidence', 'yesterday'].some((key) => content.private[key]?.trim()) && <Collapse items={[{ key: 'legacy', label: '此前填写的补充记录', children: <div className="notebook-detail-fields">{['toolEvidence', 'candidates', 'normalPlan', 'strongPlan', 'weakPlan', 'holdingEvidence', 'yesterday'].filter((key) => content.private[key]?.trim()).map(renderField)}</div> }]} />}
              <Space wrap size={12} className="notebook-actions">
                <Button type="primary" disabled={!snapshot || !dirty} loading={busy} onClick={save}>保存记录</Button>
                <Button onClick={() => { setPreviewRich(false); setPreview(internalText(date, content)); }}>预览记录</Button>
              </Space>
                      </div>,
          },
          {
            key: 'public',
            label: '图文素材',
            children: <div className="notebook-panel">
              <ArticleEditor date={date} revision={snapshot?.revision || 0} content={content} disabled={!snapshot} dirty={dirty} onStatus={setStatus} onMaterials={changeMaterials} onChange={(article) => { editCounter.current += 1; setContent((old) => ({ ...old, article })); setDirty(true); }} />
                      </div>,
          },
          {
            key: 'history',
            label: '历史记录',
            children: <div className="notebook-panel">
              <Space wrap size={12}>
<span>历史版本只读，保留当时记录和素材。</span>
<Button onClick={() => download(`复盘记录-${date}.md`, internalText(date, content))}>导出当前记录</Button>
</Space>
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
              {!!snapshot?.publications.length && (
<Collapse items={[{
  key: 'publications',
  label: '此前登记的发布链接',
  children: snapshot.publications.map((p) => (
<p key={p.id}>
<a href={p.url} target="_blank" rel="noopener noreferrer">{`${p.channel === 'wechat' ? '公众号' : '雪球'}文章，版本 ${p.revision}`}</a>
<Button type="link" onClick={() => { setPreviewRich(true); setPreviewImages([]); setPreview(p.body); }}>查看快照</Button>
</p>
  )),
}]}
/>
              )}
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
