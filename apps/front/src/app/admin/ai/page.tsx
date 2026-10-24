'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Alert, Button, DatePicker, Drawer, Space, Tabs,
} from 'antd';
import { useAccount } from '@/auth/Boundary';
import { isPersonalAiOwner } from '@/auth/client';
import { useDefaultTradeDate } from '@/hooks/useDefaultTradeDate';
import SelectField from '@/components/SelectField';
import TaskState, { useAiTasks } from '@/components/PersonalAi/TaskState';
import AnalysisPanel from '@/components/PersonalAi/AnalysisPanel';
import { consoleRequest, Task } from '@/components/PersonalAi/client';
import Notebook from '@/app/review/Notebook';
import { mayLeaveResearch } from '@/utils/research-navigation';
import dayjs from 'dayjs';
import PageHeading from '@/auth/PageHeading';
import { RobotOutlined } from '@ant-design/icons';
import Settings from './Settings';
import TaskHistory from './TaskHistory';
import StockResearch from './StockResearch';
import './workspace.css';
import '@/components/PersonalAi/personal-ai.css';
import '@/app/review/review.css';

const tabs = ['stocks', 'review', 'history', 'settings'];
function Workspace({ ownerId }: { ownerId: number }) {
  const params = useSearchParams();
  const fallback = useDefaultTradeDate();
  const context = useAiTasks();
  const [, setDirty] = useState(false);
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
    if (!taskId) { setSelected(null); return undefined; }
    let active = true;
    const task = context?.state?.tasks.find((row) => row.id === taskId);
    if (task) setSelected(task);
    else consoleRequest<Task>(`/tasks/${encodeURIComponent(taskId)}`).then((value) => { if (active) setSelected(value); }).catch(() => { if (active) setSearchError('任务读取失败，请刷新重试'); });
    return () => { active = false; };
  }, [taskId, context?.state?.tasks]);
  return (
    <div className="admin-ai-workspace personal-ai-stack">
      <PageHeading title="AI 工具" description="研究股票、制作图文复盘，查看分析任务和模型设置。" icon={<RobotOutlined />} />
      <Tabs
        activeKey={tab}
        onChange={(value) => { update({ tab: value, aiTask: '' }); }}
        items={[
          { key: 'stocks', label: '股票研究' }, { key: 'review', label: '图文复盘' }, { key: 'history', label: '任务记录' }, { key: 'settings', label: '模型设置' },
        ]}
      />
      {(tab === 'stocks' || tab === 'review') && (
      <Space className="ai-date-toolbar" wrap size={12}>
        <SelectField label="研究日期"><DatePicker aria-label="AI 研究日期" value={date ? dayjs(date) : null} allowClear={false} onChange={(value) => { if (value) update({ date: value.format('YYYY-MM-DD'), aiTask: '' }); }} /></SelectField>
        <Link href={`/review/?date=${date}`}>查看本日复盘记录</Link>
      </Space>
      )}
      {fallback.error && <Alert type="warning" message={fallback.error} action={<Button onClick={fallback.retry}>重试日期</Button>} />}
      {tab === 'stocks' && date && (
      <>
        {searchError && <Alert type="error" message={searchError} />}
        <StockResearch ownerId={ownerId} date={date} />
      </>
      )}
      {tab === 'review' && date && <Notebook key={date} mode="publish" date={date} onDirty={setDirty} />}
      {tab === 'history' && (
      <>
        {searchError && <Alert type="error" message={searchError} />}
        {context?.error && <Alert type="error" message={context.error} />}
        <TaskHistory tasks={context?.state?.tasks || []} loading={!context?.state && !context?.error} selectedId={taskId} onRefresh={() => context?.refresh() || Promise.resolve()} onSelect={(task) => { update({ tab: 'history', aiTask: task.id, date: task.date }); }} />
        <Drawer
          className="admin-drawer ai-task-drawer"
          title="AI 任务详情"
          width="min(1040px, 100vw)"
          open={!!taskId}
          onClose={() => { update({ aiTask: '' }); }}
          footer={(
            <div className="admin-overlay-footer">
              <span className="personal-ai-caption">查看记录不会发起新的分析。</span>
              <Button onClick={() => { update({ aiTask: '' }); }}>关闭</Button>
            </div>
)}
        >
          <div className="admin-overlay-stack">
            {!selected && <p role="status">{searchError || '正在读取任务详情…'}</p>}
            {selected?.skill === 'market-review' && selected.answer && <Button type="primary" onClick={() => { update({ tab: 'review', date: selected.date, aiTask: selected.id }); }}>核对并应用到图文</Button>}
            {selected && <AnalysisPanel key={selected.id} ownerId={ownerId} skill={selected.skill} date={selected.date} strategy={selected.strategy} candidates={selected.codes.map((code) => ({ code }))} initialTaskId={selected.id} />}
          </div>
        </Drawer>
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
