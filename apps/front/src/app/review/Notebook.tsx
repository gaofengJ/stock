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
import { emptyNotebook, internalFields, NotebookContent } from './notebook-model';
import { eveningFlow } from './evening-flow';
import { emptyArticle } from './article-contract';
import {
  captureElement, capturePlatform, captureSources, mergePlatformImages, missingPlatformImages,
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
  const captureAbort = useRef<AbortController>();
  const captureTask = useRef<Promise<string> | null>(null);
  const autoPrepared = useRef(false);
  useEffect(() => { onDirty(dirty); }, [dirty, onDirty]);
  useEffect(() => () => captureAbort.current?.abort(), []);
  useEffect(() => {
    let active = true;
    request.get<Snapshot>('/review/notebook', { params: { date }, autoShowError: false })
      .then(({ data }) => { if (active) { setSnapshot(data); setContent(data.content || emptyNotebook()); setDirty(false); setError(''); setStatus(data.revision ? '已读取保存的记录' : '当天尚未保存'); } })
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
  const changed = useCallback((next: NotebookContent) => { editCounter.current += 1; current.current = next; setContent(next); setDirty(true); }, []);
  const change = (key: string, value: string) => changed({ ...current.current, private: { ...current.current.private, [key]: value } });
  const save = async () => {
    if (!snapshot || busy || researchBusy) return;
    setBusy(true); setError(''); const edit = editCounter.current;
    try {
      const saved = current.current;
      const { data } = await request.post<{ revision: number }>('/review/notebook', {
        date, revision: snapshot.revision, generation: snapshot.generation || 0, content: JSON.stringify(saved),
      }, { autoShowError: false });
      setSnapshot({ ...snapshot, revision: data.revision, content: saved });
      if (editCounter.current === edit) setDirty(false);
      setStatus('记录与图片已保存');
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };
  const captureCandidates = useCallback((text: string) => {
    editCounter.current += 1;
    const next = { ...current.current, private: { ...current.current.private, toolEvidence: text.slice(0, 24000) } };
    current.current = next; setContent(next); setDirty(true);
  }, []);
  const visibleStatus = dirty ? '有未保存的记录或图片' : status;
  const materials = content.materials || emptyMaterials();
  const changeMaterials = (value: Materials) => {
    try { changed({ ...current.current, materials: validateMaterials(value) }); } catch (e) { setError((e as Error).message); }
  };
  const importMarket = useCallback((onlyMissing = false): Promise<string> => {
    if (captureTask.current) return captureTask.current;
    if (!snapshot) return Promise.resolve('复盘记录尚未读取完成，请稍后重试。');
    const keys = onlyMissing ? missingPlatformImages(current.current.article?.images || []) : [...captureSources.map((item) => item.key), 'candidates'];
    if (!keys.length) return Promise.resolve('');
    const abort = new AbortController(); captureAbort.current = abort;
    if (!onlyMissing) setSourceRefresh((value) => value + 1);
    setResearchBusy(true); setError(''); setStatus('正在读取当日资料并生成平台图片');
    const task = (async () => {
      try {
        const [research, captured] = await Promise.all([onlyMissing && current.current.research ? Promise.resolve(current.current.research) : loadResearch(date), capturePlatform(date, abort.signal, setStatus, keys)]);
        if (abort.signal.aborted) return '';
        if (keys.includes('candidates')) {
          let candidate = document.getElementById('review-candidate-table');
          const deadline = Date.now() + 30000;
          while (!abort.signal.aborted && Date.now() < deadline && (candidate?.dataset.reviewReady !== 'true' || candidate.dataset.reviewDate !== date)) {
            // eslint-disable-next-line no-await-in-loop -- Wait for the existing candidate request without starting another request.
            await new Promise((resolve) => { setTimeout(resolve, 250); });
            candidate = document.getElementById('review-candidate-table');
          }
          if (abort.signal.aborted) return '';
          if (candidate?.dataset.reviewReady === 'true' && candidate.dataset.reviewDate === date) {
            try { captured.images.push(...await captureElement(candidate, 'platform-candidates', `${date} 策略候选（当前筛选页）`, `${window.location.origin}/strategy/?date=${date}`, '个股筛选')); } catch { captured.failures.push('策略候选'); }
          } else captured.failures.push('策略候选');
        }
        if (abort.signal.aborted) return '';
        changed({ ...current.current, research, article: mergePlatformImages(current.current.article || emptyArticle(), captured.images) });
        setStatus(`已将 ${captured.images.length} 张平台图片加入文档模板，请保存记录。`);
        const warning = captured.failures.length ? `以下图片暂未取得：${captured.failures.join('、')}。已保留成功图片与原有记录，可再次更新重试。` : '';
        setError(warning); return warning;
      } catch (e) { const warning = abort.signal.aborted ? '' : errorMessage(e); if (warning) setError(warning); return warning; } finally { captureTask.current = null; if (!abort.signal.aborted) setResearchBusy(false); }
    })();
    captureTask.current = task;
    return task;
  }, [snapshot, date, changed]);
  useEffect(() => {
    if (!snapshot || autoPrepared.current) return;
    autoPrepared.current = true;
    importMarket(true);
  }, [snapshot, importMarket]);
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
      <div className="notebook-start">
        <nav className="notebook-flow" aria-label="每日复盘四步">
          {eveningFlow.map((stage) => <Button key={stage.id} onClick={() => document.getElementById(`evening-${stage.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>{stage.title}</Button>)}
        </nav>
        <Space wrap size={12}>
          <Button disabled={!snapshot} loading={researchBusy} onClick={() => importMarket()}>更新当日资料</Button>
          <span className="review-caption">自动把平台图表加入复盘文档，文字记录可留空。</span>
          <Link href="/trading-system/" target="_blank" rel="noopener noreferrer">复盘方法</Link>
        </Space>
      </div>
      <div className="notebook-stages">
        {eveningFlow.map((stage) => {
          const prefix = ({ market: '市场观察', themes: '题材梳理', candidates: '个股筛选' } as Record<string, string>)[stage.id];
          const images = (content.article?.images || []).filter((item) => item.id.startsWith('platform-') && item.after === prefix);
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
        <ArticleEditor date={date} generation={snapshot?.generation || 0} revision={snapshot?.revision || 0} content={content} disabled={!snapshot || researchBusy} previewDisabled={!snapshot} onPreparePreview={() => importMarket(true)} dirty={dirty} onStatus={setStatus} onMaterials={changeMaterials} onChange={(article) => changed({ ...current.current, article })} />
        <Button type="primary" className="notebook-save-bottom" disabled={!snapshot || !dirty || researchBusy} loading={busy} onClick={save}>保存复盘</Button>
      </Card>
    </div>
  );
}
