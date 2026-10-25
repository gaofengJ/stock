'use client';

/* eslint jsx-a11y/label-has-associated-control: ["error", { "assert": "htmlFor" }] */

import {
  ReactNode, useCallback, useEffect, useRef, useState,
} from 'react';
import {
  Alert, Button, Card, Checkbox, Collapse, Image, Input, Modal, Space,
} from 'antd';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useAccount } from '@/auth/Boundary';
import { registerLeaveGuard, mayLeaveResearch } from '@/utils/research-navigation';
import { useCollection } from '@/components/ResearchCollection';
import { acknowledgeCollection } from '@/components/ResearchCollection/store';
import request from '@/api/request';
import { marketRequest, MarketStatus } from '@/api/market';
import { errorMessage } from '@/api/errors';
import TaskState from '@/components/PersonalAi/TaskState';
import { draftKey, legacyDraft, parseDraft } from './review-draft';
import { localNotebook, LocalNotebook } from './local-notebook';
import {
  ReviewWorkspace, WatchDraft, CollectedItem, emptyWorkspace, mergeCollected, validateWorkspace,
} from './workspace-contract';
import NotebookHistory, { NotebookSnapshot } from './NotebookHistory';
import { fetchNotebookImage, loadNotebookImages } from './notebook-images';
import InvestmentCalendar from '../basic/components/InvestmentCalendar';
import { Materials, emptyMaterials, validateMaterials } from './materials-contract';
import { loadResearch } from './research';
import {
  emptyNotebook, publicFields, internalFields, NotebookContent, SavedNotebook, synchronizeArticle, recordText,
} from './notebook-model';
import { leavesDocument } from './navigation-guard';
import { emptyArticle } from './article-contract';
import { notebookPayload, toolEvidenceError } from './notebook-limits';
import {
  capturePlatform, captureSources, currentPlatformImages, mergePlatformImages, missingPlatformImages,
} from './platform-images';
import './notebook.css';

const ArticleEditor = dynamic(() => import('./ArticleEditor'), { ssr: false });

const recordStages = [
  {
    id: 'market', title: '市场判断', keys: ['marketJudgment', 'themes'], guidance: '记录当天市场变化和关注方向。', links: [['/analysis/overview', '查看市场概览']],
  },
  {
    id: 'candidates', title: '观察股票', keys: [], guidance: '为观察股票写清理由、触发条件与放弃条件。', links: [],
  },
  {
    id: 'execution', title: '当日总结', keys: ['lesson'], guidance: '记录经验、反思或后续需要核实的事项，可留空。', links: [],
  },
];

type Snapshot = NotebookSnapshot;
export default function Notebook({
  date, renderTools = () => null, onDirty, mode = 'record',
}: { mode?: 'record' | 'publish'; date: string; renderTools?: (capture: (text: string) => void, onSelection?: (items: string[]) => void, generation?: number, refresh?: number, draft?: WatchDraft, onDraft?: (draft: WatchDraft) => void) => ReactNode; onDirty: (value: boolean) => void }) {
  const publishing = mode === 'publish';
  const stages = publishing ? [] : recordStages;
  const { user } = useAccount(); const owner = user!.id; const router = useRouter();
  const inbox = useCollection(owner, date);
  const [removedItem, setRemovedItem] = useState<CollectedItem | null>(null);
  const [recovery, setRecovery] = useState<LocalNotebook | null>(null);
  const [localError, setLocalError] = useState('');
  const [leaveOpen, setLeaveOpen] = useState(false);
  const leaveResult = useRef<((value: boolean) => void) | null>(null);
  const writes = useRef(Promise.resolve());
  const [content, setContent] = useState<NotebookContent>(emptyNotebook);
  const current = useRef(content); current.current = content;
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(dirty); dirtyRef.current = dirty;
  const persistenceRef = useRef<() => Promise<void>>(async () => {});
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
        date, publicationBodies: 0, previous: 1, assetReferences: 1,
      },
      signal: abort.signal,
      autoShowError: false,
    })
      .then(async ({ data }) => ({ ...data, content: await loadNotebookImages(data.content, abort.signal, (hash) => fetchNotebookImage(hash, abort.signal)) }))
      .then(async (data) => {
        let local: LocalNotebook | null = null;
        try { local = await localNotebook(owner, date); } catch { if (active) setLocalError('本机草稿读取不可用，请在离开前保存到服务器'); }
        if (!active) return;
        const recoverable = local && local.generation === (data.generation || 0);
        const sameVersion = recoverable && local!.revision === data.revision;
        const next = sameVersion ? local!.content : data.content || emptyNotebook();
        if (!next.workspace) {
          let draft = legacyDraft(next.private.toolEvidence);
          try { const key = (data.generation || 0) ? `${draftKey(owner, date)}:reset-${data.generation}` : draftKey(owner, date); const cached = parseDraft(localStorage.getItem(key)); if (cached.selected.length || cached.focus || cached.exit || cached.reason) draft = cached; } catch { /* Saved legacy text remains available. */ }
          next.workspace = { ...emptyWorkspace(), draft };
        }
        current.current = next; setSnapshot(data); setContent(next); setDirty(!!sameVersion); setError('');
        if (recoverable && !sameVersion) setRecovery(local);
        const serverStatus = data.revision ? `已读取服务器记录，版本 ${data.revision}` : '当天尚未保存到服务器';
        setStatus(sameVersion ? '已恢复本机未保存草稿，请核对后保存' : serverStatus);
      })
      .catch((e) => { if (active) { setError(errorMessage(e)); setStatus('读取失败，重试后可编辑'); } });
    return () => { active = false; abort.abort(); };
  }, [date, attempt, owner]);
  const persist = useCallback(async () => {
    if (!snapshot || !dirtyRef.current) return;
    const value: LocalNotebook = {
      revision: snapshot.revision, generation: snapshot.generation || 0, content: current.current, savedAt: new Date().toISOString(),
    };
    const edit = editCounter.current;
    const work = writes.current.catch(() => {}).then(() => (dirtyRef.current && editCounter.current === edit ? localNotebook(owner, date, value) : null)).then(() => {});
    writes.current = work;
    try { await work; setLocalError(''); } catch { setLocalError('本机草稿保存失败，请保持页面打开并保存到服务器'); throw Error('本机草稿尚未保存'); }
  }, [owner, date, snapshot]);
  useEffect(() => {
    if (!dirty || !snapshot) return undefined;
    const timer = window.setTimeout(() => { persist().catch(() => {}); }, 250);
    return () => { window.clearTimeout(timer); };
  }, [content, dirty, snapshot, persist]);
  persistenceRef.current = persist;
  useEffect(() => () => { if (dirtyRef.current) persistenceRef.current().catch(() => {}); }, []);
  useEffect(() => {
    if (!dirty) return undefined;
    const leave = (event: BeforeUnloadEvent) => { persist().catch(() => {}); event.preventDefault(); event.returnValue = ''; };
    const unregister = registerLeaveGuard(() => new Promise<boolean>((resolve) => { if (leaveResult.current) { resolve(false); return; } leaveResult.current = resolve; setLeaveOpen(true); }));
    const block = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest('a') : null;
      if (anchor && leavesDocument(anchor, event, window.location.href)) {
        event.preventDefault(); event.stopPropagation();
        const url = anchor.href;
        mayLeaveResearch().then((allowed) => { if (allowed) { if (new URL(url).origin === window.location.origin) router.push(url); else window.location.assign(url); } });
      }
    };
    window.addEventListener('beforeunload', leave); document.addEventListener('click', block, true);
    return () => { unregister(); window.removeEventListener('beforeunload', leave); document.removeEventListener('click', block, true); };
  }, [dirty, persist, router]);
  const finishLeave = (value: boolean) => { setLeaveOpen(false); const resolve = leaveResult.current; leaveResult.current = null; resolve?.(value); };
  const changed = useCallback((next: NotebookContent) => { editCounter.current += 1; dirtyRef.current = true; current.current = next; setContent(next); setDirty(true); }, []);
  const changeWorkspace = useCallback((workspace: ReviewWorkspace) => { try { changed({ ...current.current, workspace: validateWorkspace(workspace) }); } catch (e) { setError(errorMessage(e)); } }, [changed]);
  const changeDraft = useCallback((draft: WatchDraft) => changeWorkspace({ ...(current.current.workspace || emptyWorkspace()), draft }), [changeWorkspace]);
  useEffect(() => {
    if (!snapshot || !inbox.length) return;
    const original = current.current.workspace || emptyWorkspace();
    try { const next = mergeCollected(original, inbox); if (JSON.stringify(next) !== JSON.stringify(original)) changeWorkspace(next); } catch (e) { setError(errorMessage(e)); }
  }, [snapshot, inbox, changeWorkspace]);
  const change = (key: string, value: string) => changed({ ...current.current, private: { ...current.current.private, [key]: value } });
  const save = async (): Promise<SavedNotebook | null> => {
    if (!snapshot || saving.current || researchBusy) return null;
    saving.current = true;
    setBusy(true); setError(''); const edit = editCounter.current;
    try {
      const saved = publishing ? synchronizeArticle(date, current.current) : current.current;
      const payload = notebookPayload(date, snapshot.revision, snapshot.generation || 0, saved);
      const { data } = await request.post<{ revision: number }>('/review/notebook', payload, { autoShowError: false });
      setSnapshot({ ...snapshot, revision: data.revision, content: saved });
      if (editCounter.current !== edit) { setStatus('已保存先前内容，新的修改仍需保存。'); return null; }
      const cleanup = writes.current.catch(() => {}).then(async () => { if (editCounter.current === edit) await localNotebook(owner, date, null); }).catch(() => {});
      writes.current = cleanup; await cleanup;
      if (editCounter.current !== edit) { setStatus('已保存先前内容，新的修改仍需保存。'); return null; }
      current.current = saved; setContent(saved); dirtyRef.current = false;
      try { acknowledgeCollection(owner, date, (saved.workspace?.items || []).map((item) => item.id)); } catch { setLocalError('服务器已保存，但本机待收录列表未能清理'); }
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
    editCounter.current += 1; dirtyRef.current = true;
    const next = { ...current.current, private: { ...current.current.private, toolEvidence: text } };
    current.current = next; setContent(next); setDirty(true);
  }, []);
  const visibleStatus = dirty ? '本页有未保存的修改，尚未同步到服务器' : status;
  const evidenceError = toolEvidenceError(content.private.toolEvidence);
  const materials = content.materials || emptyMaterials();
  const changeMaterials = (value: Materials) => {
    try { changed({ ...current.current, materials: validateMaterials(value) }); } catch (e) { setError((e as Error).message); }
  };
  // Optional callbacks extend the existing capture API.
  // eslint-disable-next-line default-param-last
  const importMarket = useCallback((onlyMissing = false, outerSignal?: AbortSignal, progress?: (text: string) => void): Promise<string> => {
    if (captureTask.current) return captureTask.current;
    if (!snapshot) return Promise.resolve('复盘记录尚未读取完成，请稍后重试。');
    const abort = new AbortController(); captureAbort.current = abort;
    const stop = () => abort.abort(); outerSignal?.addEventListener('abort', stop, { once: true }); if (outerSignal?.aborted) abort.abort();
    const report = (text: string) => { setStatus(text); progress?.(text); };
    if (!onlyMissing) setSourceRefresh((value) => value + 1);
    setResearchBusy(true); setError(''); setStatus('正在读取当日资料并生成平台图片');
    const task = (async () => {
      try {
        const { data: before } = await marketRequest<MarketStatus>('status', {}, { signal: abort.signal, autoShowError: false });
        if (!before.revision) throw new Error('暂时无法确认数据版本，请稍后重试');
        const keys = onlyMissing ? missingPlatformImages(currentPlatformImages(current.current.article?.images || [], before.revision)) : captureSources.map((item) => item.key);
        if (!keys.length) return '';
        const [research, captured] = await Promise.all([loadResearch(date, abort.signal), capturePlatform(date, abort.signal, report, keys, before.revision, async (image) => {
          const { data: statusNow } = await marketRequest<MarketStatus>('status', {}, { signal: abort.signal, autoShowError: false });
          if (statusNow.revision !== before.revision) throw Error('数据版本变化，请重新准备');
          changed({ ...current.current, article: mergePlatformImages(current.current.article || emptyArticle(), [image], before.revision) });
        })]);
        if (abort.signal.aborted) throw new DOMException('已停止准备，完成的图片已保留', 'AbortError');
        const { data: after } = await marketRequest<MarketStatus>('status', {}, { signal: abort.signal, autoShowError: false });
        if (before.revision !== after.revision) throw new Error('准备期间数据已更新，原有记录已保留。请重新准备，避免混用不同版本的数据。');
        changed({ ...current.current, research, article: mergePlatformImages(current.current.article || emptyArticle(), captured.images, before.revision) });
        setStatus(`已将 ${captured.images.length} 张平台图片加入文档模板，请保存记录。`);
        const warning = captured.failures.length ? `以下图片暂未取得：${captured.failures.join('、')}。已保留成功图片与原有记录，可再次更新重试。` : '';
        setError(warning); return warning;
      } catch (e) { if (abort.signal.aborted) { setStatus('已停止，完成的图片已保留'); throw new DOMException('已停止准备，未发起 AI 分析', 'AbortError'); } const warning = errorMessage(e); setError(warning); return warning; } finally { outerSignal?.removeEventListener('abort', stop); captureTask.current = null; setResearchBusy(false); }
    })();
    captureTask.current = task;
    return task;
  }, [snapshot, date, changed]);
  const renderField = (key: string) => {
    const field = internalFields.find(([k]) => k === key)!;
    return (
      <div className="notebook-field" key={key}>
        <label htmlFor={`note-${key}`}>{key === 'lesson' ? '经验与反思' : field[1]}</label>
        <Input.TextArea id={`note-${key}`} disabled={!snapshot} value={content.private[key]} placeholder={key === 'lesson' ? '记录今天的经验、反思或待核实事项' : field[2]} autoSize={{ minRows: key === 'lesson' ? 4 : 2 }} maxLength={4000} onChange={(e) => change(key, e.target.value)} />
      </div>
    );
  };
  return (
    <div className="review-notebook notebook-panel">
      <div className="notebook-toolbar">
        <div className="notebook-toolbar-main">
          <div className="notebook-save-status">
            <strong>{date}</strong>
            <span role="status">{researchBusy ? status : visibleStatus}</span>
          </div>
          <Space wrap size={12} className="notebook-toolbar-actions">
            {!publishing && (
            <Button
              disabled={!snapshot}
              onClick={() => {
                const url = URL.createObjectURL(new Blob([recordText(date, current.current)], { type: 'text/markdown;charset=utf-8' }));
                const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${date}-复盘记录.md`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
              }}
            >
              导出记录
            </Button>
            )}
            <Button type="primary" aria-label="保存复盘" aria-busy={busy} disabled={!dirty || busy || researchBusy} loading={busy} onClick={save}>保存复盘</Button>
          </Space>
        </div>
        <nav className="notebook-flow" aria-label={publishing ? '图文操作' : '复盘记录'}>
          {stages.map((stage) => <Button key={stage.id} onClick={() => document.getElementById(`evening-${stage.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>{stage.title}</Button>)}
        </nav>
      </div>
      {localError && <Alert type="error" message={localError} />}
      {error && <Alert type="warning" message={error} action={!snapshot && <Button onClick={() => setAttempt((x) => x + 1)}>重新读取</Button>} />}
      {evidenceError && evidenceError !== error && <Alert type="warning" message={evidenceError} />}
      {!publishing && snapshot && (
      <NotebookHistory
        snapshot={snapshot}
        verification={content.private.yesterday || ''}
        onVerify={(text) => change('yesterday', text)}
        onCopy={(previous) => {
          const existing = current.current.workspace || emptyWorkspace();
          const selected = [...existing.draft.selected, ...previous.draft.selected.filter((pick) => !existing.draft.selected.some((row) => row.tsCode === pick.tsCode))];
          changeWorkspace({
            ...existing,
            draft: {
              ...existing.draft, selected, notes: { ...previous.draft.notes, ...existing.draft.notes }, riskNotes: { ...previous.draft.riskNotes, ...existing.draft.riskNotes },
            },
          });
        }}
      />
      )}
      <div className="notebook-stages">
        {stages.map((stage) => {
          const prefix = ({ market: '市场数据', themes: '涨停板复盘', candidates: '策略选股' } as Record<string, string>)[stage.id];
          const images = (publishing ? content.article?.images || [] : []).filter((item) => item.id.startsWith('platform-') && (item.after === prefix || (stage.id === 'market' && ['市场概览', '情绪指标', '连板分析', '20日板块轮动'].includes(item.after))));
          return (
            <Card id={`evening-${stage.id}`} key={stage.id} title={stage.title}>
              <p className="review-caption">{stage.guidance}</p>
              {!!stage.links.length && <Space wrap size={12} className="notebook-links">{stage.links.map(([path, label]) => <Link key={path} href={`${path}${path.includes('?') ? '&' : '?'}date=${date}`} target="_blank" rel="noopener noreferrer">{label}</Link>)}</Space>}
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
              {publishing && stage.id === 'themes' && (
                <div className="notebook-detail-fields">
                  <Checkbox disabled={!snapshot} checked={materials.showCalendar} onChange={(e) => changeMaterials({ ...materials, showCalendar: e.target.checked })}>显示投资日历</Checkbox>
                  {materials.showCalendar && <InvestmentCalendar date={calendarDate} onDate={setCalendarDate} selected={materials.calendar} onSelect={(calendar) => changeMaterials({ ...materials, calendar })} />}
                </div>
              )}
              {stage.id === 'candidates' && snapshot && <div className="notebook-tools">{renderTools(captureCandidates, undefined, snapshot.generation || 0, sourceRefresh, content.workspace?.draft, changeDraft)}</div>}
              {stage.keys.map(renderField)}
            </Card>
          );
        })}
      </div>
      {!publishing && (
      <Collapse items={[{
        key: 'execution',
        label: '今日操作与上次判断验证（可选）',
        children: (
          <>
            {renderField('execution')}
            {renderField('yesterday')}
          </>
        ),
      }, {
        key: 'collection',
        label: `已收录素材（${content.workspace?.items.length || 0}）`,
        children: (
          <>
            {(content.workspace?.items || []).map((item) => (
              <div className="research-item" key={item.id}>
                <strong>{item.title}</strong>
                <a href={item.url} target="_blank" rel="noreferrer">查看来源与当时条件</a>
                <Input.TextArea aria-label={`${item.title}素材备注`} value={item.note} maxLength={12000} onChange={(event) => changeWorkspace({ ...current.current.workspace!, items: current.current.workspace!.items.map((row) => (row.id === item.id ? { ...row, note: event.target.value } : row)) })} />
                <Checkbox checked={!!item.includeInArticle} onChange={(event) => changeWorkspace({ ...current.current.workspace!, items: current.current.workspace!.items.map((row) => (row.id === item.id ? { ...row, includeInArticle: event.target.checked } : row)) })}>纳入复盘文档</Checkbox>
                <Button onClick={() => { setRemovedItem(item); try { acknowledgeCollection(owner, date, [item.id]); } catch { setLocalError('本机待收录列表清理失败，请在保存后核对'); } changeWorkspace({ ...current.current.workspace!, items: current.current.workspace!.items.filter((row) => row.id !== item.id) }); }}>移除素材</Button>
              </div>
            ))}
            {removedItem && <Button onClick={() => { changeWorkspace({ ...current.current.workspace!, items: [...current.current.workspace!.items, removedItem] }); setRemovedItem(null); }}>撤销移除素材</Button>}
            {!content.workspace?.items.length && <p>从股票、资讯、图表或 AI 结果收录，素材随本篇复盘保存。</p>}
          </>
        ),
      }]}
      />
      )}
      {!publishing && (
      <Collapse items={[{
        key: 'archive',
        label: '其他既有记录与图文',
        children: (
          <div className="notebook-panel">
            {internalFields.filter(([key]) => !['marketJudgment', 'themes', 'lesson', 'execution', 'yesterday'].includes(key) && content.private[key]?.trim()).map(([key]) => renderField(key))}
            {Object.entries(content.public).filter(([, value]) => value.trim()).map(([key, value]) => (
              <div key={key}>
                <strong>{publicFields.find(([field]) => field === key)?.[1] || '既有记录'}</strong>
                <pre className="notebook-text">{value}</pre>
              </div>
            ))}
            {content.article?.body && (
              <>
                <strong>已保存图文正文</strong>
                <pre className="notebook-text">{content.article.body}</pre>
              </>
            )}
            {!!content.article?.images.length && <Image.PreviewGroup><div className="notebook-platform-images">{content.article.images.map((image) => <Image key={image.id} src={image.data} alt={image.caption} />)}</div></Image.PreviewGroup>}
          </div>
        ),
      }]}
      />
      )}
      {publishing && (
      <Card id="review-document" title="生成与编辑图文" className="notebook-document">
        <div className="notebook-field">
          <label htmlFor="review-document-title">文章名称</label>
          <Input id="review-document-title" value={content.public.title || `${date}复盘`} disabled={!snapshot} maxLength={200} onChange={(e) => changed({ ...current.current, public: { ...current.current.public, title: e.target.value }, ...(current.current.article?.body ? { article: { ...current.current.article, body: current.current.article.body.replace(/^# [^\n]+/, `# ${e.target.value || `${date}复盘`}`) } } : {}) })} />
        </div>
        <TaskState><ArticleEditor prepareImages={async (signal, progress) => { const warning = await importMarket(true, signal, progress); if (warning) throw Error(warning); }} date={date} generation={snapshot?.generation || 0} revision={snapshot?.revision || 0} content={content} disabled={!snapshot || researchBusy || busy} onSave={save} previewDisabled={!snapshot} dirty={dirty} onStatus={setStatus} onMaterials={changeMaterials} onChange={(article) => changed({ ...current.current, article })} /></TaskState>
      </Card>
      )}
      {publishing && (
      <Collapse items={[{
        key: 'materials',
        label: '资料与配图（生成时自动准备）',
        children: (
          <div className="notebook-start">
            <p className="review-caption">使用当天已保存的记录制作图文。分析结果应用前需核对，已有原文和图片会保留。</p>

            <Space wrap size={12}>
              <Button disabled={!snapshot} loading={researchBusy} onClick={() => { importMarket(!(content.article?.images || []).some((image) => image.id.startsWith('platform-'))).catch(() => {}); }}>{(content.article?.images || []).some((image) => image.id.startsWith('platform-')) ? '更新图文资料' : '准备图文资料'}</Button>
              {!researchBusy && !!(content.article?.images || []).some((image) => image.id.startsWith('platform-')) && missingPlatformImages(content.article?.images || []).length > 0 && <Button onClick={() => { importMarket(true).catch(() => {}); }}>补取缺失图片</Button>}
              {researchBusy && <Button onClick={() => captureAbort.current?.abort()}>停止准备</Button>}
              <span className="review-caption">包含市场、情绪、连板、涨停和20日板块轮动；更新保留个人配图。</span>
              <Link href="/trading-system/" target="_blank" rel="noopener noreferrer">复盘方法</Link>
            </Space>
          </div>
        ),
      }]}
      />
      )}
      {publishing && <Collapse items={[{ key: 'notes', label: '核对本日原始记录（可选）', children: <div className="notebook-panel">{['marketJudgment', 'themes', 'lesson'].map(renderField)}</div> }]} />}
      <Modal
        className="review-dialog"
        centered
        title="离开前处理未保存复盘"
        open={leaveOpen}
        onCancel={() => finishLeave(false)}
        footer={(
          <Space wrap>
            <Button onClick={() => finishLeave(false)}>继续编辑</Button>
            <Button onClick={async () => { try { await persist(); finishLeave(true); } catch { finishLeave(false); } }}>保留本机草稿并离开</Button>
            <Button type="primary" loading={busy} onClick={async () => { if (await save()) finishLeave(true); }}>保存并离开</Button>
          </Space>
)}
      >
        <p>记录和图片尚未同步到服务器。保留本机草稿后，可在本设备返回继续编辑。</p>
      </Modal>
      <Modal
        className="review-dialog"
        centered
        title="发现服务器版本更新前的本机草稿"
        open={!!recovery}
        onCancel={() => setRecovery(null)}
        footer={(
          <Space wrap>
            <Button onClick={() => setRecovery(null)}>继续查看服务器版本</Button>
            <Button onClick={() => { if (recovery) { changed(recovery.content); setRecovery(null); setStatus('已恢复旧草稿供合并，请核对服务器变化后保存'); } }}>恢复草稿供合并</Button>
          </Space>
)}
      >
        <p>
          本机草稿基于版本
          {recovery?.revision}
          ，服务器当前为版本
          {snapshot?.revision}
          。恢复不会立即写入服务器。
        </p>
        <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(recovery?.content.private, null, 2)}</pre>
      </Modal>
    </div>
  );
}
