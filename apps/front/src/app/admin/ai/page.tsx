'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Alert, Button, DatePicker, Space, Tabs,
} from 'antd';
import { useAccount } from '@/auth/Boundary';
import { api, isPersonalAiOwner } from '@/auth/client';
import { useDefaultTradeDate } from '@/hooks/useDefaultTradeDate';
import SelectField from '@/components/SelectField';
import TaskState, { useAiTasks } from '@/components/PersonalAi/TaskState';
import AnalysisPanel, { Candidate } from '@/components/PersonalAi/AnalysisPanel';
import { consoleRequest, statusNames, Task } from '@/components/PersonalAi/client';
import Notebook from '@/app/review/Notebook';
import { mayLeaveResearch } from '@/utils/research-navigation';
import dayjs from 'dayjs';
import Settings from './Settings';
import '@/components/PersonalAi/personal-ai.css';
import '@/app/review/review.css';

const tabs = ['stocks', 'review', 'history', 'settings'];
function Workspace({ ownerId }: { ownerId: number }) {
  const params = useSearchParams();
  const fallback = useDefaultTradeDate();
  const context = useAiTasks();
  const [, setDirty] = useState(false);
  const [search, setSearch] = useState('');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [searchError, setSearchError] = useState('');
  const [selected, setSelected] = useState<Task | null>(null);
  const requested = params?.get('tab') || (params?.get('aiTask') ? 'history' : 'stocks');
  const tab = tabs.includes(requested) ? requested : 'stocks';
  const linked = params?.get('date') || '';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(linked) && dayjs(linked).format('YYYY-MM-DD') === linked ? linked : fallback.tradeDate;
  const taskId = params?.get('aiTask') || '';
  const update = async (values: Record<string, string>) => {
    if (!await mayLeaveResearch()) return;
    const url = new URL(window.location.href);
    Object.entries(values).forEach(([key, value]) => { if (value) url.searchParams.set(key, value); else url.searchParams.delete(key); });
    window.history.pushState(null, '', url); setSelected(null);
  };
  useEffect(() => {
    if (tab !== 'stocks' || !search.trim()) return undefined;
    let active = true;
    const timer = setTimeout(() => {
      api<{ tsCode: string; name: string }[]>(`/news/stocks?q=${encodeURIComponent(search.trim())}`)
        .then((rows) => { if (active) { setCandidates((old) => [...new Map([...old, ...rows.map((row) => ({ code: row.tsCode, name: row.name }))].map((row) => [row.code, row])).values()].slice(-200)); setSearchError(''); } })
        .catch(() => { if (active) setSearchError('股票搜索失败，请重新输入名称或代码'); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [search, tab]);
  useEffect(() => {
    if (!taskId) return undefined;
    let active = true;
    const task = context?.state?.tasks.find((row) => row.id === taskId);
    if (task) setSelected(task);
    else consoleRequest<Task>(`/tasks/${encodeURIComponent(taskId)}`).then((value) => { if (active) setSelected(value); }).catch(() => { if (active) setSearchError('任务读取失败，请刷新重试'); });
    return () => { active = false; };
  }, [taskId, context?.state?.tasks]);
  return (
    <div className="personal-ai-stack">
      <div>
        <h1 className="page-heading">AI 工具</h1>
        <p className="review-caption">按需研究股票或制作图文。只有点击开始分析才会调用模型。</p>
      </div>
      <Tabs
        activeKey={tab}
        onChange={(value) => { update({ tab: value, aiTask: '' }); }}
        items={[
          { key: 'stocks', label: '股票研究' }, { key: 'review', label: '图文复盘' }, { key: 'history', label: '任务记录' }, { key: 'settings', label: '模型设置' },
        ]}
      />
      {(tab === 'stocks' || tab === 'review') && (
      <Space wrap size={12}>
        <SelectField label="研究日期"><DatePicker aria-label="AI 研究日期" value={date ? dayjs(date) : null} allowClear={false} onChange={(value) => { if (value) update({ date: value.format('YYYY-MM-DD'), aiTask: '' }); }} /></SelectField>
        <Link href={`/review/?date=${date}`}>查看本日复盘记录</Link>
      </Space>
      )}
      {fallback.error && <Alert type="warning" message={fallback.error} action={<Button onClick={fallback.retry}>重试日期</Button>} />}
      {tab === 'stocks' && date && (
      <>
        {searchError && <Alert type="error" message={searchError} />}
        <AnalysisPanel key={date} ownerId={ownerId} skill="candidate-compare" date={date} candidates={candidates} onSearch={setSearch} />
      </>
      )}
      {tab === 'review' && date && <Notebook key={date} mode="publish" date={date} onDirty={setDirty} />}
      {tab === 'history' && (
      <>
        {searchError && <Alert type="error" message={searchError} />}
        {context?.error && <Alert type="error" message={context.error} />}
        <Space wrap>
          <Button onClick={() => context?.refresh().catch(() => {})}>刷新任务记录</Button>
          <span className="review-caption">离开本页后，已提交任务会继续执行。</span>
        </Space>
        <div className="personal-ai-task-list">
          {(context?.state?.tasks || []).map((task) => <Button key={task.id} block onClick={() => { update({ tab: 'history', aiTask: task.id, date: task.date }); }}>{`${task.date} ${task.skill === 'market-review' ? '图文复盘' : '股票研究'}：${statusNames[task.status] || task.status}`}</Button>)}
          {context?.state && !context.state.tasks.length && <p>暂无任务记录。</p>}
        </div>
        {selected?.skill === 'market-review' && selected.answer && <Button onClick={() => { update({ tab: 'review', date: selected.date, aiTask: selected.id }); }}>核对并应用到图文</Button>}
        {selected && <AnalysisPanel key={selected.id} ownerId={ownerId} skill={selected.skill} date={selected.date} strategy={selected.strategy} candidates={selected.codes.map((code) => ({ code }))} initialTaskId={selected.id} />}
      </>
      )}
      {tab === 'settings' && <Settings ownerId={ownerId} />}
    </div>
  );
}
export default function AiToolsPage() {
  const { user } = useAccount();
  return isPersonalAiOwner(user) ? <TaskState><Workspace ownerId={user!.id} /></TaskState> : <Alert type="error" message="仅绑定的本人管理员可用。" />;
}
