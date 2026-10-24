'use client';

import SelectField from '@/components/SelectField';
import {
  useCallback, useEffect, useRef, useState,
} from 'react';
import {
  Alert, Button, Card, Checkbox, Collapse, Empty, Form, Input, Modal, Select, Space, Spin, Tag,
} from 'antd';
import Link from 'next/link';
import { copyText } from '@/utils/clipboard';
import { CollectButton } from '@/components/ResearchCollection';
import ModelControls from './ModelControls';
import ResultText from './ResultText';
import { useAiTasks } from './TaskState';
import {
  activeTask, ConsoleState, consoleRequest, DataSummary, defaultChoice, Metadata, ModelChoice,
  modelNames, readChoice, saveChoice, Skill, statusNames, StrategyContext, supportsChoice, Task, taskGroups, strategyCaption, taskHref,
} from './client';
import './personal-ai.css';

export interface Candidate { code: string; name?: string }
export type PrepareAnalysis = (signal: AbortSignal, progress: (text: string) => void) => Promise<void>;
const failText = (reason: unknown) => (reason instanceof Error ? reason.message : '操作失败，请稍后重试');
const sourceNames: Record<string, string> = {
  market: '市场概览', breadth: '涨跌广度', sentiment: '情绪指标', feedback: '强势股反馈', sectors20: '20日板块轮动', themes: '涨停题材',
};
const sourcePaths: Record<string, string> = {
  market: 'overview', breadth: 'overview', sentiment: 'senti', feedback: 'senti', sectors20: 'sectors', themes: 'limits',
};
const reviewSections = ['市场概览', '情绪指标', '连板分析', '20日板块轮动', '涨停板复盘'];
interface Preview { summary: DataSummary; bytes: number; signature: string }
export default function AnalysisPanel({
  ownerId, skill, date, candidates = [], strategy, beforeStart, onComplete, initialCodes = [], initialTaskId, canApplySections = false, readOnly = false, onSearch,
}: {
  ownerId: number; skill: Skill; date: string; candidates?: Candidate[]; strategy?: StrategyContext;
  beforeStart?: PrepareAnalysis; onComplete?: (task: Task, section?: string) => void;
  initialCodes?: string[]; initialTaskId?: string; canApplySections?: boolean; readOnly?: boolean; onSearch?: (value: string) => void;
}) {
  const taskContext = useAiTasks(); const globalRefresh = taskContext?.refresh;
  const [localState, setLocalState] = useState<ConsoleState | null>(null); const state = taskContext?.state || localState;
  const [choice, setChoice] = useState<ModelChoice>(defaultChoice);
  const [codes, setCodes] = useState<string[]>(initialCodes.slice(0, 3));
  const [question, setQuestion] = useState(''); const [chosen, setChosen] = useState<Task | null>(null); const [parent, setParent] = useState<Task | null>(null);
  const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false); const [submitting, setSubmitting] = useState(false); const [checking, setChecking] = useState(false); const [refreshing, setRefreshing] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null); const [ready, setReady] = useState(false);
  const [elapsed, setElapsed] = useState(0); const [textOnly, setTextOnly] = useState(false); const [section, setSection] = useState<string>();
  const [gapConfirm, setGapConfirm] = useState<string[] | null>(null); const gapAnswer = useRef<((yes: boolean) => void) | null>(null);
  const pending = useRef(false); const mounted = useRef(true); const preparation = useRef<AbortController | null>(null);
  const requestKey = useRef<{ body: string; key: string } | null>(null);
  const contextSignature = JSON.stringify(strategy || {});
  const storageKey = `personal-ai-draft:v2:${ownerId}:${skill}:${date}:${contextSignature}`;
  const refresh = useCallback(async () => {
    const value = await (globalRefresh ? globalRefresh() : consoleRequest<ConsoleState>('/status'));
    if (mounted.current) setLocalState(value); return value;
  }, [globalRefresh]);
  useEffect(() => {
    mounted.current = true; setChoice(readChoice(ownerId));
    let saved: { question?: string; codes?: string[]; chosenId?: string; parentId?: string; requestKey?: typeof requestKey.current } = {};
    try { const parsed = readOnly ? {} : JSON.parse(localStorage.getItem(storageKey) || '{}'); if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) saved = parsed; } catch { setNotice('本机输入草稿不可用，请及时复制问题'); }
    setQuestion(typeof saved.question === 'string' ? saved.question.slice(0, 2000) : '');
    const savedCodes = Array.isArray(saved.codes) ? saved.codes.filter((code) => /^\d{6}\.(SH|SZ|BJ)$/.test(code)).slice(0, 3) : [];
    setCodes(initialCodes.length ? initialCodes.slice(0, 3) : savedCodes);
    requestKey.current = saved.requestKey || null; setReady(true);
    refresh().then(async (value) => {
      const active = value.tasks.find((task) => task.skill === skill && task.date === date && activeTask(task.status));
      const id = initialTaskId || active?.id || saved.chosenId;
      if (id) {
        const result = await consoleRequest<Task>(`/tasks/${encodeURIComponent(id)}`);
        if (mounted.current && result.skill === skill && result.date === date) { setChosen(result); if (saved.parentId === result.id && result.status === 'completed') setParent(result); }
      }
    }).catch((reason) => { if (mounted.current) setError(failText(reason)); });
    return () => { mounted.current = false; preparation.current?.abort(); gapAnswer.current?.(false); };
  // Initial candidates are captured when this panel is opened; subsequent selection is local.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerId, skill, date, storageKey, refresh, initialTaskId, readOnly]);
  useEffect(() => {
    if (!ready || readOnly) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify({
        question, codes, chosenId: chosen?.id, parentId: parent?.id, requestKey: requestKey.current,
      }));
    } catch { setNotice('输入草稿未能保存在本机，请复制后再离开'); }
  }, [question, codes, chosen?.id, parent?.id, ready, storageKey, readOnly]);
  const chosenId = chosen?.id; const chosenStatus = chosen?.status;
  useEffect(() => {
    if (!chosenId || !activeTask(chosenStatus || '')) return undefined;
    let alive = true; let stream: EventSource | null = null;
    const accept = (result: Task) => { if (alive) { setChosen(result); if (!activeTask(result.status)) { stream?.close(); refresh().catch(() => {}); } } };
    if (state?.capabilities?.streaming) {
      stream = new EventSource(`/personal-ai/api/tasks/${chosenId}/events`);
      stream.onmessage = (event) => { try { accept(JSON.parse(event.data)); } catch { setError('回复读取失败，请重新打开任务恢复'); } };
      stream.onerror = () => { if (alive) setNotice('连接暂时中断，正在恢复，不会重复提交任务'); };
      stream.onopen = () => { if (alive) setNotice(''); };
    }
    const timer = window.setInterval(async () => {
      if (document.hidden || stream?.readyState === EventSource.OPEN || pending.current) return;
      pending.current = true;
      try { accept(await consoleRequest<Task>(`/tasks/${chosenId}`)); } catch (reason) { if (alive) setError(failText(reason)); } finally { pending.current = false; }
    }, 5000);
    return () => { alive = false; stream?.close(); window.clearInterval(timer); };
  }, [chosenId, chosenStatus, state?.capabilities?.streaming, refresh]);
  useEffect(() => {
    if (!chosen?.createdAt || !activeTask(chosenStatus || '')) return undefined;
    const created = Date.parse(chosen.createdAt); const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - created) / 1000)));
    tick(); const timer = window.setInterval(tick, 1000); return () => window.clearInterval(timer);
  }, [chosen?.createdAt, chosenStatus]);
  const active = state?.tasks.find((task) => activeTask(task.status));
  const running = !!active || (!!chosen && activeTask(chosen.status));
  const recent = state?.tasks.filter((task) => task.skill === skill && task.date === date) || [];
  const selectedCodes = parent ? parent.codes : codes; const activeStrategy = parent?.strategy || strategy;
  const supported = supportsChoice(state?.metadata, choice);
  const disabled = !ready || busy || checking || running || !state?.enabled || !supported;
  const dataSignature = JSON.stringify({ date, codes: selectedCodes, strategy: activeStrategy });
  const currentPreview = preview?.signature === dataSignature ? preview : null;
  const options = Array.from(new Map<string, Candidate>([...selectedCodes.map((code) => ({ code })), ...candidates].map((item) => [item.code, item])).values());
  const payload = () => ({
    parentId: parent?.id || null, skill, date, codes: selectedCodes, message: question.trim() || (skill === 'market-review' ? '生成简洁、有证据的图文复盘解读。' : '比较所选股票的特点、风险及需要核验的信息。'), ...choice, ...(skill === 'candidate-compare' ? { strategy: activeStrategy } : {}),
  });
  async function inspectData(signal?: AbortSignal) {
    const result = await consoleRequest<{ snapshot: { strategy?: { name: string }; stocks?: Candidate[]; gaps: string[]; limitations: string[]; sources: DataSummary['sources'] }; inputBytes: number }>('/preview', 'POST', { ...payload(), key: crypto.randomUUID(), parentId: null }, signal);
    const value: Preview = {
      signature: dataSignature,
      bytes: result.inputBytes,
      summary: {
        strategy: result.snapshot.strategy?.name || '每日复盘：市场、情绪、板块与涨停题材', stocks: (result.snapshot.stocks || []).map((stock) => ({ code: stock.code, name: stock.name || stock.code })), gaps: result.snapshot.gaps, limitations: result.snapshot.limitations, sources: result.snapshot.sources,
      },
    };
    if (mounted.current) setPreview(value); return value;
  }
  function stopPreparation() { preparation.current?.abort(); gapAnswer.current?.(false); gapAnswer.current = null; setGapConfirm(null); }
  async function submit() {
    if (pending.current || disabled || readOnly) return;
    if (skill === 'market-review' && !state?.capabilities?.reviewDocument) { setError('复盘文档服务正在更新，请稍后重试'); return; }
    if (skill === 'candidate-compare' && (!selectedCodes.length || selectedCodes.length > 3 || !activeStrategy)) { setError('请选择1至3只股票，并从策略页面打开'); return; }
    pending.current = true; setBusy(true); setError(''); setNotice('正在检查分析资料');
    const abort = new AbortController(); preparation.current = abort;
    let sent = false;
    const body = payload(); const signature = JSON.stringify(body);
    if (requestKey.current?.body !== signature) requestKey.current = { body: signature, key: crypto.randomUUID() };
    try {
      localStorage.setItem(storageKey, JSON.stringify({
        question, codes, chosenId: chosen?.id, parentId: parent?.id, requestKey: requestKey.current,
      }));
      if (!parent) {
        const checked = await inspectData(abort.signal);
        if (checked.summary.gaps.length) {
          setGapConfirm(checked.summary.gaps);
          const proceed = await new Promise<boolean>((resolve) => { gapAnswer.current = resolve; });
          if (!proceed) abort.abort();
        }
      }
      if (abort.signal.aborted) throw new DOMException('准备已停止，未调用模型', 'AbortError');
      if (beforeStart && !textOnly && !parent) await beforeStart(abort.signal, (text) => { if (mounted.current) setNotice(text); });
      if (abort.signal.aborted || !mounted.current) throw new DOMException('准备已停止，未调用模型', 'AbortError');
      sent = true; setSubmitting(true); setNotice('资料已就绪，正在提交分析');
      const task = await consoleRequest<Task>('/tasks', 'POST', { ...body, key: requestKey.current.key });
      requestKey.current = null;
      if (mounted.current) { setChosen(task); setNotice('任务已提交，关闭侧栏后可从任务记录返回'); }
      await refresh();
    } catch (reason) { if (mounted.current) { if (abort.signal.aborted && !sent) setNotice('已停止准备，未发起新的 AI 分析'); else setError(sent ? `提交结果待确认，请刷新任务状态；重试会复用同一请求。${failText(reason)}` : failText(reason)); } } finally { pending.current = false; preparation.current = null; if (mounted.current) { setBusy(false); setSubmitting(false); } }
  }
  async function checkData() {
    if (disabled || pending.current || (skill === 'candidate-compare' && (!selectedCodes.length || !activeStrategy))) return;
    pending.current = true; setChecking(true); setError('');
    const abort = new AbortController(); preparation.current = abort;
    try { await inspectData(abort.signal); if (mounted.current) setNotice('数据检查完成，未调用模型，也未占用任务预算。'); } catch (reason) { if (mounted.current) setError(abort.signal.aborted ? '已停止数据检查' : failText(reason)); } finally { pending.current = false; preparation.current = null; if (mounted.current) setChecking(false); }
  }
  async function view(task: Task) {
    setError(''); setParent(null); setSection(undefined);
    try { const value = await consoleRequest<Task>(`/tasks/${task.id}`); if (mounted.current) setChosen(value); } catch (reason) { setError(failText(reason)); }
  }
  const addPrompt = (text: string) => setQuestion((old) => [old, text].filter(Boolean).join('\n').slice(0, 2000));
  const questionInput = (
    <Form.Item label={parent ? `继续追问（第${parent.historyTurns + 1}次，最多6次）` : '分析要求（可留空）'}>
      <Input.TextArea aria-label="分析要求" value={question} rows={3} maxLength={2000} showCount disabled={busy || running} onChange={(event) => setQuestion(event.target.value)} placeholder="填写重点、篇幅或特殊要求，也可直接使用默认分析" />
      <Space wrap>{(parent ? ['解释上述结论的证据', '列出仍缺失的资料', '压缩到300字'] : ['简洁复盘，突出主要变化', '重点说明风险和反向证据', '与前一交易日对照']).map((text) => <Button size="small" key={text} disabled={busy || running} onClick={() => addPrompt(text)}>{text}</Button>)}</Space>
    </Form.Item>
  );
  const defaultCaption = skill === 'market-review' ? '根据市场、情绪、连板、20日板块轮动和涨停资料生成图文。私人笔记和观察记录按原文合稿，AI 不读取或改写。' : '使用所选日期的市场、行业、走势和已披露业绩，不包含实时新闻。';
  return (
    <div className="personal-ai-stack">
      <div className="personal-ai-context">
        <Space wrap>
          <strong>{date}</strong>
          <Tag>{skill === 'market-review' ? '图文复盘' : '候选对比'}</Tag>
          <span>仅本人可用</span>
        </Space>
        <p>{parent ? '追问沿用原任务的数据快照，不重新获取行情。' : defaultCaption}</p>
        {activeStrategy && (
        <p>
          策略：
          {strategyCaption(activeStrategy)}
          {activeStrategy.sector ? `；行业/概念：${activeStrategy.sector}` : ''}
          {activeStrategy.keyword ? `；关键词：${activeStrategy.keyword}` : ''}
        </p>
        )}
      </div>
      {(error || taskContext?.error) && <Alert type="error" showIcon message={error || taskContext?.error} action={<Button onClick={() => refresh().catch(() => {})}>刷新状态</Button>} />}
      {notice && <Alert type="info" showIcon message={notice} />}
      {active && active.id !== chosen?.id && <Alert type="info" message={`${active.date} 的${active.skill === 'market-review' ? '复盘' : '对比'}任务正在执行，完成后此处自动恢复`} description="可在本页的任务记录中查看进度或停止。" />}
      {state && !state.enabled && <Alert type="warning" message="AI 调用当前已暂停，可查看历史结果" />}
      {!state && <Button loading={!error} onClick={() => refresh().catch((reason) => setError(failText(reason)))}>读取状态</Button>}
      {!readOnly && (
      <Form layout="vertical" onFinish={() => submit()}>
        <div className="personal-ai-stack">
          {skill === 'candidate-compare' && <Form.Item label="对比股票"><Select aria-label="对比股票" mode="multiple" showSearch onSearch={onSearch} filterOption={onSearch ? false : undefined} optionFilterProp="label" value={selectedCodes} placeholder="选择1至3只股票" disabled={busy || running || !!parent} onChange={(values) => { if (values.length <= 3) setCodes(values); else setError('每次最多选择3只股票'); }} options={options.map((item) => ({ value: item.code, label: item.name ? `${item.name} ${item.code}` : item.code, disabled: selectedCodes.length >= 3 && !selectedCodes.includes(item.code) }))} /></Form.Item>}
          {!parent && questionInput}
          <Collapse
            ghost
            items={[{
              key: 'settings',
              forceRender: true,
              label: `模型与高级选项：${modelNames[choice.model]} / ${choice.effort}`,
              children: (
                <Space direction="vertical" style={{ width: '100%' }}>
                  <ModelControls value={choice} onChange={setChoice} metadata={state?.metadata} disabled={busy || running} />
                  <Button disabled={busy || running} onClick={() => { try { saveChoice(ownerId, choice); setNotice('当前模型与档位已设为默认'); } catch (reason) { setError(failText(reason)); } }}>设为默认模型</Button>
                  {beforeStart && <Checkbox checked={textOnly} disabled={busy || running || !!parent} onChange={(event) => setTextOnly(event.target.checked)}>仅生成文字，稍后补图</Checkbox>}
                  {!parent && <Button onClick={() => checkData()} loading={checking} disabled={disabled || (skill === 'candidate-compare' && !selectedCodes.length)}>检查分析数据</Button>}
                </Space>
              ),
            }]}
          />
          {!supported && <Alert type="warning" message="当前账号不支持此模型与档位，请重新选择" />}
          {!parent && (
          <Space wrap>
            <Button type="primary" htmlType="submit" loading={busy} disabled={disabled || (skill === 'candidate-compare' && !selectedCodes.length)}>{skill === 'market-review' ? '生成复盘文档' : '开始对比'}</Button>
            <Button disabled={busy || running} onClick={() => { setParent(null); setChosen(null); setQuestion(''); setPreview(null); setSection(undefined); setNotice('已开始新会话'); setError(''); requestKey.current = null; }}>新建会话</Button>
            <span className="personal-ai-caption">点击分析才消耗订阅用量</span>
          </Space>
          )}
          {(busy || checking) && <Button danger disabled={submitting} onClick={() => stopPreparation()}>{submitting ? '正在确认任务提交' : '停止准备'}</Button>}
        </div>
      </Form>
      )}
      {currentPreview && (
      <Card size="small" title="分析数据检查">
        <div className="personal-ai-stack">
          <strong>{currentPreview.summary.strategy}</strong>
          <span>{currentPreview.summary.stocks.map((stock) => stock.name).join('、')}</span>
          <Space wrap>
            {currentPreview.summary.sources.map((source) => (
              <Tag key={source.name} color={source.state === 'ready' ? 'green' : 'orange'}>
                {sourcePaths[source.name] ? <Link href={`/analysis/${sourcePaths[source.name]}/?date=${date}`} target="_blank">{sourceNames[source.name] || source.name}</Link> : sourceNames[source.name] || source.name}
                ：
                {source.state === 'ready' ? '已读取' : '缺失'}
              </Tag>
            ))}
          </Space>
          <Alert showIcon type={currentPreview.summary.gaps.length ? 'warning' : 'success'} message={currentPreview.summary.gaps.length ? '部分资料缺失' : '核心数据已就绪'} description={currentPreview.summary.gaps.join('；') || '已按本功能的数据范围完成整理。'} />
          <span className="personal-ai-caption">{currentPreview.summary.limitations.join('；')}</span>
        </div>
      </Card>
      )}
      <Card size="small" title="分析结果" extra={chosen && <Tag>{statusNames[chosen.status]}</Tag>}>
        {chosen ? (
          <div className="personal-ai-stack">
            <span className="personal-ai-caption">
              {new Date(chosen.createdAt).toLocaleString('zh-CN')}
              ，
              {modelNames[chosen.model]}
              {' '}
              /
              {' '}
              {chosen.effort}
            </span>
            {activeTask(chosen.status) && (
            <div role="status">
              <Spin size="small" />
              {' '}
              {({
                identity: '核验登录', data: '整理当日资料', accountBefore: '检查模型与额度', model: chosen.answer ? '正在生成正文' : '正在分析资料', accountAfter: '整理完成结果',
              } as Record<string, string>)[chosen.stage || ''] || '准备分析'}
              ，已用
              {' '}
              {elapsed}
              {' '}
              秒
            </div>
            )}
            {chosen.answer ? <ResultText text={chosen.answer} /> : <p>{chosen.error || (activeTask(chosen.status) ? '正在准备数据和分析，请稍候。' : '该任务没有可用正文，可新建分析。')}</p>}
            {chosen.answer && chosen.error && <Alert type="warning" message={chosen.error} />}
            {!!chosen.contextSummary?.gaps.length && <Alert type="warning" message="本次资料限制" description={chosen.contextSummary.gaps.join('；')} />}
            <Space wrap>
              {chosen.answer && <Button onClick={async () => setNotice(await copyText(chosen.answer!) ? '分析结果已复制' : '复制失败，请选中正文复制')}>复制结果</Button>}
              {onComplete && chosen.status === 'completed' && (
              <>
                <SelectField label="应用范围"><Select aria-label="应用范围" style={{ width: 190 }} value={section || 'all'} options={[{ value: 'all', label: '整篇 AI 分析' }, ...reviewSections.map((value) => ({ value, label: `仅更新${value}`, disabled: !canApplySections }))]} onChange={(value) => setSection(value === 'all' ? undefined : value)} /></SelectField>
                <Button type="primary" onClick={() => { try { onComplete(chosen, section); } catch (reason) { setError(failText(reason)); } }}>预览并应用到复盘</Button>
              </>
              )}
              {chosen.status === 'completed' && chosen.answer && (
              <CollectButton
                item={{
                  id: `ai:${chosen.id}`, kind: 'ai', date, title: `${date} ${skill === 'market-review' ? '复盘分析' : '股票对比'}`, url: taskHref(chosen), note: chosen.answer.slice(0, 12000),
                }}
                label={chosen.answer.length > 12000 ? '收录前12000字为素材' : '收录结论为素材'}
              />
              )}
              {!readOnly && chosen.status === 'completed' && !parent && <Button disabled={running || chosen.historyTurns >= 6 || chosen.skillVersion !== (skill === 'market-review' ? 'v3' : 'v2')} onClick={() => { setParent(chosen); setChoice({ model: chosen.model, effort: chosen.effort }); setQuestion(''); }}>继续追问</Button>}
              {activeTask(chosen.status) && <Button danger onClick={async () => { try { setChosen(await consoleRequest<Task>(`/tasks/${chosen.id}/cancel`, 'POST', {})); await refresh(); } catch (reason) { setError(failText(reason)); } }}>停止任务</Button>}
            </Space>
            {!!chosen.contextSummary?.stocks.length && (
            <Space wrap>
              {chosen.contextSummary.stocks.map((stock) => (
                <Link key={stock.code} href={`/basic/stock/detail/?code=${stock.code}&date=${date}`} target="_blank">
                  核验
                  {stock.name || stock.code}
                </Link>
              ))}
            </Space>
            )}
            {parent && (
            <Form layout="vertical" onFinish={() => submit()}>
              {questionInput}
              <Space wrap>
                <Button type="primary" htmlType="submit" loading={busy} disabled={disabled}>发送追问</Button>
                <Button disabled={busy || running} onClick={() => { setParent(null); setChosen(null); setPreview(null); setQuestion(''); requestKey.current = null; setNotice('新分析将重新读取所选日期的数据'); }}>刷新数据并新建分析</Button>
              </Space>
            </Form>
            )}
            {chosen.historyTurns >= 6 && <p>已达到追问上限，请新建会话。</p>}
            {chosen.skillVersion !== (skill === 'market-review' ? 'v3' : 'v2') && <p>此记录使用旧版数据范围，请新建分析使用当前上下文。</p>}
          </div>
        ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="尚未发起分析" />}
      </Card>
      <Collapse items={[{
        key: 'history',
        label: `本日最近记录（${recent.length}）`,
        children: recent.length ? taskGroups(recent).map((group) => (
          <section key={group[group.length - 1].id}>
            <p>
              会话：
              {group[group.length - 1].message.slice(0, 60)}
            </p>
            {group.map((task) => (
              <div className="personal-ai-history" key={task.id}>
                <div>
                  <strong>
                    {new Date(task.createdAt).toLocaleTimeString('zh-CN')}
                    {' '}
                    {task.codes.map((code) => candidates.find((item) => item.code === code)?.name || code).join('、') || '市场复盘'}
                  </strong>
                  <p>{task.message.slice(0, 100)}</p>
                  <span>
                    {statusNames[task.status]}
                    ，追问轮次
                    {' '}
                    {task.historyTurns}
                    ，
                    {modelNames[task.model]}
                  </span>
                </div>
                <Button onClick={() => view(task)}>查看结果</Button>
              </div>
            ))}
          </section>
        )) : <Empty description="该日暂无记录" />,
      }, {
        key: 'usage',
        label: '用量与技术详情',
        children: (
          <Space direction="vertical">
            <span>
              今日调用
              {state?.today.calls || 0}
              /
              {state?.limits.dailyCalls || '—'}
              ，Token预算占用
              {state?.today.tokens || 0}
              /
              {state?.limits.dailyTokens || '—'}
            </span>
            <p>执行前会预留预算，结束后按实际用量结算。</p>
            {currentPreview && (
            <p>
              业务上下文约
              {(currentPreview.bytes / 1024).toFixed(1)}
              {' '}
              KB，不包含 Codex 系统上下文；不是 Token 计费估值。
            </p>
            )}
            {chosen && (
            <p>
              资料契约版本：
              {chosen.skillVersion || '未知'}
              ；任务：
              {chosen.id}
            </p>
            )}
            {chosen?.timings && <p>{Object.entries(chosen.timings).map(([name, time]) => `${name} ${(time / 1000).toFixed(1)}秒`).join('，')}</p>}
            {chosen?.usage && (
            <p>
              输入
              {chosen.usage.input_tokens ?? '未知'}
              ，输出
              {chosen.usage.output_tokens ?? '未知'}
              {' '}
              Token
            </p>
            )}
            <Button loading={refreshing} disabled={running || busy} onClick={async () => { setRefreshing(true); try { await consoleRequest<Metadata>('/account', 'POST', {}); await refresh(); setNotice('额度与模型已刷新，未调用模型'); } catch (reason) { setError(failText(reason)); } finally { setRefreshing(false); } }}>刷新额度</Button>
            <Link href="/admin/ai/">模型设置</Link>
            <p>只使用已登录的订阅，不自动购买额度。</p>
          </Space>
        ),
      }]}
      />
      <Modal
        title="部分分析资料缺失"
        open={!!gapConfirm}
        onCancel={() => { gapAnswer.current?.(false); gapAnswer.current = null; setGapConfirm(null); }}
        footer={(
          <Space>
            <Button onClick={() => { gapAnswer.current?.(false); gapAnswer.current = null; setGapConfirm(null); }}>取消并补齐资料</Button>
            <Button type="primary" onClick={() => { gapAnswer.current?.(true); gapAnswer.current = null; setGapConfirm(null); }}>按现有资料继续</Button>
          </Space>
)}
      >
        <p>{gapConfirm?.join('；')}</p>
        <p>核心数据已通过检查，生成结果会说明这些限制。</p>
      </Modal>
    </div>
  );
}
