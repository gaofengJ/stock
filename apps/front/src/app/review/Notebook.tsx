'use client';

/* eslint jsx-a11y/label-has-associated-control: ["error", { "assert": "htmlFor" }] */

import {
  ReactNode, useCallback, useEffect, useRef, useState,
} from 'react';
import {
  Alert, Button, Card, Checkbox, Image, Input, Space,
} from 'antd';
import Link from 'next/link';
import request from '@/api/request';
import { marketRequest, MarketStatus } from '@/api/market';
import { errorMessage } from '@/api/errors';
import { fetchNotebookImage, loadNotebookImages } from './notebook-images';
import ArticleEditor from './ArticleEditor';
import InvestmentCalendar from '../basic/components/InvestmentCalendar';
import { Materials, emptyMaterials, validateMaterials } from './materials-contract';
import { loadResearch } from './research';
import {
  emptyNotebook, internalFields, NotebookContent, SavedNotebook,
} from './notebook-model';
import { leavesDocument } from './navigation-guard';
import { eveningFlow } from './evening-flow';
import { emptyArticle } from './article-contract';
import { notebookPayload, toolEvidenceError } from './notebook-limits';
import {
  capturePlatform, captureSources, currentPlatformImages, mergePlatformImages, missingPlatformImages,
} from './platform-images';
import './notebook.css';

interface Snapshot { date: string; revision: number; generation?: number; content: NotebookContent | null }
export default function Notebook({ date, renderTools, onDirty }: { date: string; renderTools: (capture: (text: string) => void, onSelection?: (items: string[]) => void, generation?: number, refresh?: number) => ReactNode; onDirty: (value: boolean) => void }) {
  const [content, setContent] = useState<NotebookContent>(emptyNotebook);
  const current = useRef(content); current.current = content;
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('正在读取复盘');
  const [calendarDate, setCalendarDate] = useState(date);
  const [researchBusy, setResearchBusy] = useState(false);
  const [sourceRefresh, setSourceRefresh] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const editCounter = useRef(0);
  const saving = useRef(false);
  const captureAbort = useRef<AbortController>(undefined);
  const captureTask = useRef<Promise<string> | null>(null);
  useEffect(() => { onDirty(dirty); }, [dirty, onDirty]);
  useEffect(() => () => captureAbort.current?.abort(), []);
  useEffect(() => {
    let active = true;
    const abort = new AbortController();
    setSnapshot(null); setContent(emptyNotebook()); setDirty(false); setError(''); setStatus('正在读取复盘');
    request.get<Snapshot>('/review/notebook', {
      params: {
        date, publicationBodies: 0, previous: 0, assetReferences: 1,
      },
      signal: abort.signal,
      autoShowError: false,
    })
      .then(async ({ data }) => ({ ...data, content: await loadNotebookImages(data.content, abort.signal, (hash) => fetchNotebookImage(hash, abort.signal)) }))
      .then((data) => { if (active) { setSnapshot(data); setContent(data.content || emptyNotebook()); setDirty(false); setError(''); setStatus(data.revision ? `已读取服务器记录，版本 ${data.revision}` : '当天尚未保存到服务器'); } })
      .catch((e) => { if (active) { setError(errorMessage(e)); setStatus('读取失败，重试后可编辑'); } });
    return () => { active = false; abort.abort(); };
  }, [date, attempt]);
  useEffect(() => {
    if (!dirty) return undefined;
    const leave = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    const block = (e: MouseEvent) => {
      const anchor = e.target instanceof Element ? e.target.closest('a') : null;
      if (anchor && leavesDocument(anchor, e, window.location.href) && !window.confirm('尚有未保存内容，确定离开？')) { e.preventDefault(); e.stopPropagation(); }
    };
    window.addEventListener('beforeunload', leave); document.addEventListener('click', block, true);
    return () => { window.removeEventListener('beforeunload', leave); document.removeEventListener('click', block, true); };
  }, [dirty]);
  const changed = useCallback((next: NotebookContent) => { editCounter.current += 1; current.current = next; setContent(next); setDirty(true); }, []);
  const change = (key: string, value: string) => changed({ ...current.current, private: { ...current.current.private, [key]: value } });
  const save = async (): Promise<SavedNotebook | null> => {
    if (!snapshot || saving.current || researchBusy) return null;
    saving.current = true;
    setBusy(true); setError(''); const edit = editCounter.current;
    try {
      const saved = current.current;
      const payload = notebookPayload(date, snapshot.revision, snapshot.generation || 0, saved);
      const { data } = await request.post<{ revision: number }>('/review/notebook', payload, { autoShowError: false });
      setSnapshot({ ...snapshot, revision: data.revision, content: saved });
      if (editCounter.current !== edit) { setStatus('已保存先前内容，新的修改仍需保存。'); return null; }
      setDirty(false);
      setStatus(`记录与图片已保存到服务器，版本 ${data.revision}`);
      return {
        date, revision: data.revision, generation: snapshot.generation || 0, content: saved,
      };
    } catch (e) {
      setError((e as { status?: number }).status === 409 ? '服务器记录已变化，本页修改仍保留。请先复制原文，再重新读取并合并，避免覆盖其他设备的记录。' : errorMessage(e));
      return null;
    } finally { saving.current = false; setBusy(false); }
  };
  const captureCandidates = useCallback((text: string) => {
    if (current.current.private.toolEvidence === text) return;
    editCounter.current += 1;
    const next = { ...current.current, private: { ...current.current.private, toolEvidence: text } };
    current.current = next; setContent(next); setDirty(true);
  }, []);
  const visibleStatus = dirty ? '本页有未保存的修改，尚未同步到服务器' : status;
  const evidenceError = toolEvidenceError(content.private.toolEvidence);
  const materials = content.materials || emptyMaterials();
  const changeMaterials = (value: Materials) => {
    try { changed({ ...current.current, materials: validateMaterials(value) }); } catch (e) { setError((e as Error).message); }
  };
  const importMarket = useCallback((onlyMissing = false): Promise<string> => {
    if (captureTask.current) return captureTask.current;
    if (!snapshot) return Promise.resolve('复盘记录尚未读取完成，请稍后重试。');
    const abort = new AbortController(); captureAbort.current = abort;
    if (!onlyMissing) setSourceRefresh((value) => value + 1);
    setResearchBusy(true); setError(''); setStatus('正在读取当日资料并生成平台图片');
    const task = (async () => {
      try {
        const { data: before } = await marketRequest<MarketStatus>('status', {}, { signal: abort.signal, autoShowError: false });
        if (!before.revision) throw new Error('暂时无法确认数据版本，请稍后重试');
        const keys = onlyMissing ? missingPlatformImages(currentPlatformImages(current.current.article?.images || [], before.revision)) : captureSources.map((item) => item.key);
        if (!keys.length) return '';
        const [research, captured] = await Promise.all([loadResearch(date), capturePlatform(date, abort.signal, setStatus, keys, before.revision)]);
        if (abort.signal.aborted) { setStatus('已停止，原有记录保留'); return ''; }
        const { data: after } = await marketRequest<MarketStatus>('status', {}, { signal: abort.signal, autoShowError: false });
        if (before.revision !== after.revision) throw new Error('准备期间数据已更新，原有记录已保留。请重新准备，避免混用不同版本的数据。');
        changed({ ...current.current, research, article: mergePlatformImages(current.current.article || emptyArticle(), captured.images, before.revision) });
        setStatus(`已将 ${captured.images.length} 张平台图片加入文档模板，请保存记录。`);
        const warning = captured.failures.length ? `以下图片暂未取得：${captured.failures.join('、')}。已保留成功图片与原有记录，可再次更新重试。` : '';
        setError(warning); return warning;
      } catch (e) { const warning = abort.signal.aborted ? '' : errorMessage(e); if (warning) setError(warning); return warning; } finally { captureTask.current = null; setResearchBusy(false); }
    })();
    captureTask.current = task;
    return task;
  }, [snapshot, date, changed]);
  const renderField = (key: string) => {
    const field = internalFields.find(([k]) => k === key)!;
    return (
      <div className="notebook-field" key={key}>
        <label htmlFor={`note-${key}`}>{field[1]}</label>
        <Input.TextArea id={`note-${key}`} disabled={!snapshot} value={content.private[key]} placeholder={`${field[2]} 你的原文会保留。`} autoSize={{ minRows: key === 'lesson' ? 4 : 2 }} maxLength={4000} onChange={(e) => change(key, e.target.value)} />
      </div>
    );
  };
  return (
    <div className="review-notebook notebook-panel">
      <div className="notebook-toolbar">
        <Space wrap size={12}>
          <Button onClick={() => document.getElementById('review-document')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>查看文档与保存</Button>
          <span role="status">{researchBusy ? status : visibleStatus}</span>
        </Space>
      </div>
      {error && <Alert type="warning" message={error} action={!snapshot && <Button onClick={() => setAttempt((x) => x + 1)}>重新读取</Button>} />}
      {evidenceError && evidenceError !== error && <Alert type="warning" message={evidenceError} />}
      <div className="notebook-start">
        <p className="review-caption">查看图表，按需记录判断，再用智能复盘生成图文。记录可以留空，已有原文会保留。</p>
        <nav className="notebook-flow" aria-label="每日复盘四步">
          {eveningFlow.map((stage) => <Button key={stage.id} onClick={() => document.getElementById(`evening-${stage.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>{stage.title}</Button>)}
        </nav>
        <Space wrap size={12}>
          <Button disabled={!snapshot} loading={researchBusy} onClick={() => importMarket(!(content.article?.images || []).some((image) => image.id.startsWith('platform-')))}>{(content.article?.images || []).some((image) => image.id.startsWith('platform-')) ? '更新图文资料' : '准备图文资料'}</Button>
          {!researchBusy && !!(content.article?.images || []).some((image) => image.id.startsWith('platform-')) && missingPlatformImages(content.article?.images || []).length > 0 && <Button onClick={() => importMarket(true)}>补取缺失图片</Button>}
          {researchBusy && <Button onClick={() => captureAbort.current?.abort()}>停止准备</Button>}
          <span className="review-caption">包含市场、情绪、连板、涨停和20日板块轮动；更新保留个人配图。</span>
          <Link href="/trading-system/" target="_blank" rel="noopener noreferrer">复盘方法</Link>
        </Space>
      </div>
      <div className="notebook-stages">
        {eveningFlow.map((stage) => {
          const prefix = ({ market: '市场数据', themes: '涨停板复盘', candidates: '策略选股' } as Record<string, string>)[stage.id];
          const images = (content.article?.images || []).filter((item) => item.id.startsWith('platform-') && (item.after === prefix || (stage.id === 'market' && ['市场概览', '情绪指标', '连板分析', '20日板块轮动'].includes(item.after))));
          return (
            <Card id={`evening-${stage.id}`} key={stage.id} title={stage.title}>
              <p className="review-caption">{stage.guidance}</p>
              <Space wrap size={12} className="notebook-links">{stage.links.map(([path, label]) => <Link key={path} href={`${path}${path.includes('?') ? '&' : '?'}date=${date}`} target="_blank" rel="noopener noreferrer">{label}</Link>)}</Space>
              {!!images.length && (
              <Image.PreviewGroup>
                <div className="notebook-platform-images">
                  {images.map((item) => (
                    <figure key={item.id}>
                      <Image src={item.data} alt={item.caption} />
                      <figcaption>{item.caption}</figcaption>
                    </figure>
                  ))}
                </div>
              </Image.PreviewGroup>
              )}
              {stage.id === 'themes' && (
                <div className="notebook-detail-fields">
                  <Checkbox disabled={!snapshot} checked={materials.showCalendar} onChange={(e) => changeMaterials({ ...materials, showCalendar: e.target.checked })}>显示投资日历</Checkbox>
                  {materials.showCalendar && <InvestmentCalendar date={calendarDate} onDate={setCalendarDate} selected={materials.calendar} onSelect={(calendar) => changeMaterials({ ...materials, calendar })} />}
                </div>
              )}
              {stage.id === 'candidates' && snapshot && <div className="notebook-tools">{renderTools(captureCandidates, undefined, snapshot.generation || 0, sourceRefresh)}</div>}
              {stage.keys.map(renderField)}
            </Card>
          );
        })}
      </div>
      <Card id="review-document" title="复盘文档" className="notebook-document">
        <div className="notebook-field">
          <label htmlFor="review-document-title">文章名称</label>
          <Input id="review-document-title" value={content.public.title || `${date}复盘`} disabled={!snapshot} maxLength={200} onChange={(e) => changed({ ...current.current, public: { ...current.current.public, title: e.target.value }, ...(current.current.article?.body ? { article: { ...current.current.article, body: current.current.article.body.replace(/^# [^\n]+/, `# ${e.target.value || `${date}复盘`}`) } } : {}) })} />
        </div>
        <ArticleEditor prepareImages={async () => { const warning = await importMarket(true); if (warning) throw Error(warning); }} date={date} generation={snapshot?.generation || 0} revision={snapshot?.revision || 0} content={content} disabled={!snapshot || researchBusy || busy} saving={busy} onSave={save} previewDisabled={!snapshot} dirty={dirty} onStatus={setStatus} onMaterials={changeMaterials} onChange={(article) => changed({ ...current.current, article })} />
      </Card>
    </div>
  );
}
