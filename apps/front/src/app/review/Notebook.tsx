'use client';

/* eslint jsx-a11y/label-has-associated-control: ["error", { "assert": "htmlFor" }] */

import {
  ReactNode, useCallback, useEffect, useRef, useState,
} from 'react';
import {
  Alert, Button, Card, Checkbox, Collapse, Image, Input, Space,
} from 'antd';
import Link from 'next/link';
import request from '@/api/request';
import { errorMessage } from '@/api/errors';
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
  capturePlatform, captureSources, mergePlatformImages, missingPlatformImages,
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
  const captureAbort = useRef<AbortController>();
  const captureTask = useRef<Promise<string> | null>(null);
  useEffect(() => { onDirty(dirty); }, [dirty, onDirty]);
  useEffect(() => () => captureAbort.current?.abort(), []);
  useEffect(() => {
    let active = true;
    request.get<Snapshot>('/review/notebook', { params: { date, publicationBodies: 0 }, autoShowError: false })
      .then(({ data }) => { if (active) { setSnapshot(data); setContent(data.content || emptyNotebook()); setDirty(false); setError(''); setStatus(data.revision ? '已读取保存的记录' : '当天尚未保存'); } })
      .catch((e) => { if (active) { setError(errorMessage(e)); setStatus('读取失败，重试后可编辑'); } });
    return () => { active = false; };
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
      setStatus('记录与图片已保存');
      return {
        date, revision: data.revision, generation: snapshot.generation || 0, content: saved,
      };
    } catch (e) { setError(errorMessage(e)); return null; } finally { saving.current = false; setBusy(false); }
  };
  const captureCandidates = useCallback((text: string) => {
    if (current.current.private.toolEvidence === text) return;
    editCounter.current += 1;
    const next = { ...current.current, private: { ...current.current.private, toolEvidence: text } };
    current.current = next; setContent(next); setDirty(true);
  }, []);
  const visibleStatus = dirty ? '有未保存的记录或图片' : status;
  const evidenceError = toolEvidenceError(content.private.toolEvidence);
  const materials = content.materials || emptyMaterials();
  const changeMaterials = (value: Materials) => {
    try { changed({ ...current.current, materials: validateMaterials(value) }); } catch (e) { setError((e as Error).message); }
  };
  const importMarket = useCallback((onlyMissing = false): Promise<string> => {
    if (captureTask.current) return captureTask.current;
    if (!snapshot) return Promise.resolve('复盘记录尚未读取完成，请稍后重试。');
    const keys = onlyMissing ? missingPlatformImages(current.current.article?.images || []) : captureSources.map((item) => item.key);
    if (!keys.length) return Promise.resolve('');
    const abort = new AbortController(); captureAbort.current = abort;
    if (!onlyMissing) setSourceRefresh((value) => value + 1);
    setResearchBusy(true); setError(''); setStatus('正在读取当日资料并生成平台图片');
    const task = (async () => {
      try {
        const [research, captured] = await Promise.all([onlyMissing && current.current.research ? Promise.resolve(current.current.research) : loadResearch(date), capturePlatform(date, abort.signal, setStatus, keys)]);
        if (abort.signal.aborted && !captured.images.length) { setStatus('已停止，原有记录保留'); return ''; }
        changed({ ...current.current, research: abort.signal.aborted ? current.current.research : research, article: mergePlatformImages(current.current.article || emptyArticle(), captured.images) });
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
          <Button type="primary" loading={busy} disabled={!snapshot || !dirty || researchBusy} onClick={save}>保存复盘</Button>
          <span role="status">{researchBusy ? status : visibleStatus}</span>
        </Space>
      </div>
      {error && <Alert type="warning" message={error} action={!snapshot && <Button onClick={() => setAttempt((x) => x + 1)}>重新读取</Button>} />}
      {evidenceError && evidenceError !== error && <Alert type="warning" message={evidenceError} />}
      <div className="notebook-start">
        <nav className="notebook-flow" aria-label="每日复盘四步">
          {eveningFlow.map((stage) => <Button key={stage.id} onClick={() => document.getElementById(`evening-${stage.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>{stage.title}</Button>)}
        </nav>
        <Space wrap size={12}>
          <Button disabled={!snapshot} loading={researchBusy} onClick={() => importMarket(true)}>准备图文资料</Button>
          {researchBusy && <Button onClick={() => captureAbort.current?.abort()}>停止准备</Button>}
          <Button disabled={!snapshot || researchBusy} onClick={() => importMarket()}>重新生成全部图片</Button>
          <span className="review-caption">准备四张暗色长图后，可直接保存并复制 Skill 任务。文字记录可留空。</span>
          <Link href="/trading-system/" target="_blank" rel="noopener noreferrer">复盘方法</Link>
        </Space>
      </div>
      <div className="notebook-stages">
        {eveningFlow.map((stage) => {
          const prefix = ({ market: '市场数据', themes: '涨停板复盘', candidates: '策略选股' } as Record<string, string>)[stage.id];
          const images = (content.article?.images || []).filter((item) => item.id.startsWith('platform-') && (item.after === prefix || (stage.id === 'market' && ['市场概览', '情绪指标', '连板分析'].includes(item.after))));
          return (
            <Card id={`evening-${stage.id}`} key={stage.id} title={stage.title}>
              <p className="review-caption">{stage.guidance}</p>
              <Space wrap size={12} className="notebook-links">{stage.links.map(([path, label]) => <Link key={path} href={`${path}?date=${date}`} target="_blank" rel="noopener noreferrer">{label}</Link>)}</Space>
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
              {stage.optional.length > 0 && <Collapse ghost items={[{ key: 'details', label: '补充说明（可选）', children: <div className="notebook-detail-fields">{stage.optional.map(renderField)}</div> }]} />}
            </Card>
          );
        })}
      </div>
      <Card title="复盘文档" className="notebook-document">
        <div className="notebook-field">
          <label htmlFor="review-document-title">文章名称</label>
          <Input id="review-document-title" value={content.public.title || `${date}复盘`} disabled={!snapshot} maxLength={200} onChange={(e) => changed({ ...current.current, public: { ...current.current.public, title: e.target.value }, ...(current.current.article?.body ? { article: { ...current.current.article, body: current.current.article.body.replace(/^# [^\n]+/, `# ${e.target.value || `${date}复盘`}`) } } : {}) })} />
        </div>
        <ArticleEditor date={date} generation={snapshot?.generation || 0} revision={snapshot?.revision || 0} content={content} disabled={!snapshot || researchBusy || busy} saving={busy} onSave={save} previewDisabled={!snapshot} onPreparePreview={() => importMarket(true)} dirty={dirty} onStatus={setStatus} onMaterials={changeMaterials} onChange={(article) => changed({ ...current.current, article })} />
      </Card>
    </div>
  );
}
