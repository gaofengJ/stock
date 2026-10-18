'use client';

import {
  useCallback, useEffect, useRef, useState,
} from 'react';
import {
  Alert, Button, Card, Collapse, Empty, Form, Input, Select, Space, Spin, Tag, Typography,
} from 'antd';
import ModelControls from './ModelControls';
import ResultText from './ResultText';
import {
  DataSummary, StrategyContext, activeTask, ConsoleState, consoleRequest, defaultChoice, Metadata, ModelChoice, modelNames, readChoice, Skill, statusNames, supportsChoice, Task,
} from './client';
import './personal-ai.css';

export interface Candidate { code: string; name?: string }
const failText = (error: unknown) => (error instanceof Error ? error.message : '操作未完成，请重试。');

export default function AnalysisPanel({
  ownerId, skill, date, candidates = [], strategy, beforeStart, onComplete,
}: {
  ownerId: number; skill: Skill; date: string; candidates?: Candidate[]; strategy?: StrategyContext; beforeStart?: () => Promise<void>; onComplete?: (task: Task) => void;
}) {
  const [state, setState] = useState<ConsoleState | null>(null);
  const [choice, setChoice] = useState<ModelChoice>(defaultChoice);
  const [codes, setCodes] = useState<string[]>([]);
  const [question, setQuestion] = useState('');
  const [chosen, setChosen] = useState<Task | null>(null);
  const [parent, setParent] = useState<Task | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [preview, setPreview] = useState<{summary:DataSummary;bytes:number;signature:string} | null>(null);
  const [checking, setChecking] = useState(false);
  const completion = useRef(onComplete); completion.current = onComplete;
  const applied = useRef(new Set<string>());
  const submitted = useRef(new Set<string>());
  const [elapsed, setElapsed] = useState(0);
  const pending = useRef(false);
  const mounted = useRef(true);
  const requestKey = useRef<{ body: string; key: string } | null>(null);
  const refresh = useCallback(async () => {
    const value = await consoleRequest<ConsoleState>('/status');
    if (mounted.current) setState(value);
    return value;
  }, []);
  useEffect(() => {
    mounted.current = true;
    setChoice(readChoice(ownerId));
    refresh().then(async (value) => {
      const current = value.tasks.find((task) => task.skill === skill && task.date === date && activeTask(task.status));
      if (current) { const result = await consoleRequest<Task>(`/tasks/${current.id}`); if (mounted.current) { submitted.current.add(result.id); setChosen(result); } }
    }).catch((reason) => { if (mounted.current) setError(failText(reason)); });
    return () => { mounted.current = false; };
  }, [date, ownerId, refresh, skill]);
  const chosenId = chosen?.id; const chosenStatus = chosen?.status; const createdAt = chosen?.createdAt;
  useEffect(() => {
    if (!chosenId || !activeTask(chosenStatus || '')) return undefined;
    let alive = true; let stream: EventSource | null = null;
    const accept = (result: Task) => { if (alive) { setChosen(result); if (!activeTask(result.status)) { stream?.close(); refresh().catch(() => {}); } } };
    if (state?.capabilities?.streaming) {
      stream = new EventSource(`/personal-ai/api/tasks/${chosenId}/events`);
      stream.onmessage = (event) => { try { accept(JSON.parse(event.data)); } catch { setError('回复读取失败，请重新打开面板恢复。'); } };
      stream.onerror = () => { if (alive) setNotice('连接暂时中断，正在恢复；不会重复提交任务。'); };
      stream.onopen = () => { if (alive) setNotice(''); };
    }
    const timer = window.setInterval(async () => {
      if (stream?.readyState === EventSource.OPEN || document.hidden || pending.current) return;
      pending.current = true;
      try { accept(await consoleRequest<Task>(`/tasks/${chosenId}`)); } catch (reason) { if (alive) setError(failText(reason)); } finally { pending.current = false; }
    }, 5000);
    return () => { alive = false; stream?.close(); window.clearInterval(timer); };
  }, [chosenId, chosenStatus, state?.capabilities?.streaming, refresh]);
  useEffect(() => {
    if (!chosen || chosen.status !== 'completed' || !submitted.current.has(chosen.id) || applied.current.has(chosen.id)) return;
    applied.current.add(chosen.id);
    try { completion.current?.(chosen); if (skill === 'market-review') setNotice('图文已生成。关闭面板后可预览、复制和保存。'); } catch (reason) { setError(failText(reason)); }
  }, [chosen, skill]);
  useEffect(() => {
    if (!createdAt || !activeTask(chosenStatus || '')) return undefined;
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - Date.parse(createdAt)) / 1000)));
    tick(); const timer = window.setInterval(tick, 1000); return () => window.clearInterval(timer);
  }, [createdAt, chosenStatus]);
  const running = !!state?.tasks.some((task) => activeTask(task.status)) || (!!chosen && activeTask(chosen.status));
  const recent = state?.tasks.filter((task) => task.skill === skill && task.date === date) || [];
  const selectedCodes = parent ? parent.codes : codes;
  const supported = supportsChoice(state?.metadata, choice);
  const disabled = busy || checking || running || !state?.enabled || !supported;
  const activeStrategy = parent?.strategy || strategy;
  const dataSignature = JSON.stringify({ date, codes: selectedCodes, strategy: activeStrategy });
  const currentPreview = preview?.signature === dataSignature ? preview : null;
  const options = Array.from(new Map<string, Candidate>([...candidates, ...(parent?.codes || []).map((code) => ({ code }))].map((item) => [item.code, item])).values());
  async function submit() {
    if (pending.current || disabled) return;
    if (skill === 'market-review' && !state?.capabilities?.reviewDocument) { setError('复盘文档服务正在更新，请稍后重试。'); return; }
    if (skill === 'candidate-compare' && (selectedCodes.length < 1 || selectedCodes.length > 3)) { setError('请选择1至3只股票。'); return; }
    pending.current = true; setBusy(true); setError(''); setNotice('');
    const payload = {
      parentId: parent?.id || null, skill, date, codes: selectedCodes, message: question.trim() || (skill === 'market-review' ? '生成简洁、有证据的图文复盘解读。' : '比较所选股票的特点、风险及需要核验的信息。'), ...choice, ...(skill === 'candidate-compare' ? { strategy: activeStrategy } : {}),
    };
    const signature = JSON.stringify(payload);
    // If a network response is lost, a manual retry with unchanged input reuses its request ID.
    if (requestKey.current?.body !== signature) requestKey.current = { body: signature, key: crypto.randomUUID() };
    try {
      if (beforeStart) { setNotice('正在补齐文档配图，完成后开始分析。'); await beforeStart(); }
      const task = await consoleRequest<Task>('/tasks', 'POST', { ...payload, key: requestKey.current.key });
      requestKey.current = null;
      if (!mounted.current) return;
      submitted.current.add(task.id); setChosen(task); setNotice('任务已提交，可以留在当前页面查看结果。');
      await refresh();
    } catch (reason) { if (mounted.current) setError(failText(reason)); } finally { pending.current = false; if (mounted.current) setBusy(false); }
  }
  async function checkData() {
    if (pending.current || disabled || (skill === 'candidate-compare' && !selectedCodes.length)) return;
    pending.current = true; setChecking(true); setError(''); setPreview(null);
    try {
      const result = await consoleRequest<{snapshot:{strategy?:{name:string};stocks?:{code:string;name:string}[];items?:{code:string;name:string}[];total?:number;included?:number;omitted?:number;gaps:string[];limitations:string[];sources:DataSummary['sources']};inputBytes:number}>('/preview', 'POST', {
        key: crypto.randomUUID(), skill, date, codes: selectedCodes, message: question.trim() || '检查数据', ...choice, ...(skill === 'candidate-compare' ? { strategy: activeStrategy } : {}),
      });
      if (mounted.current) {
        setPreview({
          signature: dataSignature,
          bytes: result.inputBytes,
          summary: {
            strategy: result.snapshot.strategy?.name || `每日复盘：候选${result.snapshot.total}只，展示${result.snapshot.included}只，省略${result.snapshot.omitted}只`, stocks: (result.snapshot.stocks || result.snapshot.items || []).map((s) => ({ code: s.code, name: s.name })), gaps: result.snapshot.gaps, limitations: result.snapshot.limitations, sources: result.snapshot.sources,
          },
        }); setNotice('数据检查完成，未调用模型，也未占用任务预算。');
      }
    } catch (reason) { if (mounted.current)setError(failText(reason)); } finally { pending.current = false; if (mounted.current)setChecking(false); }
  }
  async function updateAccount() {
    setRefreshing(true); setError('');
    try { await consoleRequest<Metadata>('/account', 'POST', {}); await refresh(); if (mounted.current) setNotice('登录、模型和额度已刷新，未调用模型。'); } catch (reason) { if (mounted.current) setError(failText(reason)); } finally { if (mounted.current) setRefreshing(false); }
  }
  async function view(task: Task) {
    setError('');
    try { const result = await consoleRequest<Task>(`/tasks/${task.id}`); if (mounted.current) { submitted.current.add(result.id); setChosen(result); } } catch (reason) { if (mounted.current) setError(failText(reason)); }
  }
  const usage = chosen?.usage;
  let contextCaption = skill === 'market-review'
    ? '根据市场、情绪、连板、20日板块轮动和涨停资料生成图文。用户记录原文保留，AI 解读单独标注。'
    : '从当前候选中选择最多3只股票，使用该日的数据进行分析。';
  if (parent) contextCaption = '追问沿用原任务的数据快照，不重新获取行情。';
  return (
    <div className="personal-ai-stack">
      <div className="personal-ai-context">
        <Space wrap>
          <strong>{date}</strong>
          <Tag>{skill === 'market-review' ? '图文复盘' : '候选对比'}</Tag>
          <Typography.Text type="secondary">仅本人可用</Typography.Text>
        </Space>
        <p className="personal-ai-caption">{contextCaption}</p>
        {skill === 'candidate-compare' && (
        <>
          <p className="personal-ai-caption">结合当前策略、大盘背景、行业题材、个股走势及已披露业绩。数据截止所选日期，不包含实时新闻。</p>
          <div className="personal-ai-caption">{activeStrategy ? '已带入打开面板时的策略与筛选条件。修改页面条件后，请重新打开面板。' : '请从当前策略页面重新打开'}</div>
        </>
        )}
      </div>
      {error && <Alert type="error" showIcon message={error} />}
      {notice && <Alert type="info" showIcon message={notice} />}
      {!state && <Button loading={!error} onClick={() => { setError(''); refresh().catch((reason) => setError(failText(reason))); }}>读取状态</Button>}

      <Form layout="vertical" onFinish={() => submit()}>
        <div className="personal-ai-stack">
          {skill === 'candidate-compare' && <Form.Item label="对比股票" style={{ marginBottom: 0 }}><Select aria-label="对比股票" mode="multiple" showSearch optionFilterProp="label" placeholder="选择1至3只股票" value={selectedCodes} disabled={busy || running || !!parent} onChange={(values) => { if (values.length <= 3) setCodes(values); else setError('每次最多选择3只股票。'); }} options={options.map((item) => ({ value: item.code, label: item.name ? `${item.name} ${item.code}` : item.code, disabled: selectedCodes.length >= 3 && !selectedCodes.includes(item.code) }))} /></Form.Item>}
          <Collapse ghost items={[{ key: 'model', label: `模型：${modelNames[choice.model]} / ${choice.effort}`, children: <ModelControls value={choice} onChange={setChoice} metadata={state?.metadata} disabled={busy || running} /> }]} />
          {!supported && <Alert type="warning" message="当前账号目录不支持这组模型和档位，请重新选择。" />}
          <Form.Item label={parent ? `继续追问（第${parent.historyTurns + 1}次，最多6次）` : '分析要求'} style={{ marginBottom: 0 }}>
            <Input.TextArea aria-label="分析要求" value={question} onChange={(event) => setQuestion(event.target.value)} rows={3} maxLength={2000} showCount disabled={busy || running} placeholder="可留空。填写你希望重点分析的方向、篇幅或特殊要求" />
          </Form.Item>
          <div className="personal-ai-actions">
            <Space wrap>
              {!parent && <Button onClick={() => checkData()} loading={checking} disabled={busy || running || checking || (skill === 'candidate-compare' && (!selectedCodes.length || !activeStrategy))}>检查分析数据</Button>}
              <Button type="primary" htmlType="submit" loading={busy} disabled={disabled || (skill === 'candidate-compare' && !selectedCodes.length)}>{parent ? '发送追问' : { 'market-review': '生成复盘文档', 'candidate-compare': '开始对比' }[skill]}</Button>
              <Button type="text" disabled={busy || running} onClick={() => { setParent(null); setQuestion(''); setNotice(''); setError(''); requestKey.current = null; }}>新建会话</Button>
            </Space>
            <span className="personal-ai-caption">点击分析才消耗订阅用量</span>
          </div>
        </div>
      </Form>
      {currentPreview && (
      <Card size="small" title="分析数据检查">
        <div className="personal-ai-stack">
          <strong>{currentPreview.summary.strategy}</strong>
          <span>{currentPreview.summary.stocks.map((s) => s.name || s.code).join('、')}</span>
          <span className="personal-ai-caption">
            业务上下文约
            {(currentPreview.bytes / 1024).toFixed(1)}
            {' '}
            KB，不包含 Codex 系统上下文；不是 Token 计费估值。
          </span>
          <Alert showIcon type={currentPreview.summary.gaps.length ? 'warning' : 'success'} message={currentPreview.summary.gaps.length ? '部分数据缺失，分析时会说明限制' : '核心数据已就绪'} description={currentPreview.summary.gaps.join('；') || '已按本功能的数据范围完成整理。'} />
          <span className="personal-ai-caption">{currentPreview.summary.limitations.join('；')}</span>
        </div>
      </Card>
      )}
      <Card size="small" title="分析结果" extra={chosen && <Tag>{statusNames[chosen.status] || chosen.status}</Tag>}>
        {chosen ? (
          <div className="personal-ai-stack">
            <div className="personal-ai-caption">
              {modelNames[chosen.model] || chosen.model}
              {' '}
              /
              {' '}
              {chosen.effort}
            </div>
            <div>
              {activeTask(chosen.status) && (
              <div className="personal-ai-progress" role="status">
                <Spin size="small" />
                <span>
                  {({
                    identity: '核验登录', data: '整理当日资料', accountBefore: '检查模型与额度', model: chosen.answer ? '正在生成正文' : '正在分析资料', accountAfter: '整理完成结果',
                  } as Record<string, string>)[chosen.stage || ''] || '准备分析'}
                  ，已用
                  {' '}
                  {elapsed}
                  {' '}
                  秒
                </span>
              </div>
              )}
              {chosen.answer ? <ResultText text={chosen.answer} /> : <div className="personal-ai-result">{chosen.error || '正在准备数据和分析，请稍候。'}</div>}
              {chosen.answer && chosen.error && <Alert type="warning" message={chosen.error} />}
            </div>
            {chosen.contextSummary?.gaps.length ? <Alert type="warning" message="本次数据限制" description={chosen.contextSummary.gaps.join('；')} /> : null}
            {chosen.timings && (
            <div className="personal-ai-caption">
              {[['data', '数据准备'], ['accountBefore', '调用前检查'], ['model', '模型进程'], ['accountAfter', '结束检查'], ['total', '总耗时']].filter(([key]) => chosen.timings?.[key] != null).map(([key, label]) => `${label} ${(chosen.timings![key] / 1000).toFixed(1)} 秒`).join('，')}
              {chosen.executionMetrics?.firstAnswerMs != null ? `；首次正文 ${(chosen.executionMetrics.firstAnswerMs / 1000).toFixed(1)} 秒` : ''}
            </div>
            )}
            {usage && (
            <div className="personal-ai-caption">
              输入
              {usage.input_tokens ?? '未知'}
              ，缓存
              {usage.cached_input_tokens ?? '未知'}
              ，输出
              {usage.output_tokens ?? '未知'}
              {' '}
              Token
            </div>
            )}
            <Space wrap>
              <Button disabled={running || chosen.status !== 'completed' || chosen.historyTurns >= 6 || chosen.skillVersion !== (skill === 'market-review' ? 'v3' : 'v2')} onClick={() => { setParent(chosen); setChoice({ model: chosen.model, effort: chosen.effort }); setQuestion(''); setNotice('已沿用该结果的数据，请在上方输入追问。'); }}>继续追问</Button>
              {activeTask(chosen.status) && <Button danger onClick={async () => { try { setChosen(await consoleRequest<Task>(`/tasks/${chosen.id}/cancel`, 'POST', {})); } catch (reason) { setError(failText(reason)); } }}>停止任务</Button>}
            </Space>
            {chosen.historyTurns >= 6 && <div className="personal-ai-caption">已达到追问上限，请新建会话。</div>}
            {chosen.skillVersion !== (skill === 'market-review' ? 'v3' : 'v2') && <div className="personal-ai-caption">此记录使用旧版数据范围，可查看原结果；请新建分析以使用完整上下文。</div>}
          </div>
        ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="尚未发起分析" />}
      </Card>
      <Collapse items={[
        {
          key: 'history',
          label: `当日记录（${recent.length}）`,
          children: recent.length ? recent.map((task) => (
            <div className="personal-ai-history" key={task.id}>
              <div>
                <div>
                  {modelNames[task.model]}
                  {' '}
                  /
                  {' '}
                  {task.effort}
                </div>
                <span className="personal-ai-caption">
                  {statusNames[task.status]}
                  ，
                  {task.codes.join('、') || '候选复盘'}
                </span>
              </div>
              <Button size="small" onClick={() => view(task)}>查看结果</Button>
            </div>
          )) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="该日暂无记录" />,
        },
        {
          key: 'usage',
          label: '用量与设置',
          children: (
            <div className="personal-ai-stack">
              <div className="personal-ai-caption">
                今日任务
                {state?.today.calls ?? 0}
                {' '}
                /
                {state?.limits.dailyCalls ?? 20}
                ，Token 预算占用
                {state?.today.tokens.toLocaleString() ?? 0}
                {' '}
                /
                {state?.limits.dailyTokens.toLocaleString() ?? '200,000'}
                。预算是准入控制，单次任务可能超出预留。
              </div>
              <Space wrap>
                <Button onClick={() => updateAccount()} loading={refreshing} disabled={running}>刷新额度</Button>
                <Button href="/admin/ai/">模型设置</Button>
              </Space>
              <div className="personal-ai-caption">只走已登录的订阅，不使用 API Key，不自动购买 credits。打开面板、选择模型和新建会话不调用模型。</div>
            </div>
          ),
        },
      ]}
      />
    </div>
  );
}
