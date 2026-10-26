'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Alert, Button, Drawer, Tabs,
} from 'antd';
import { useAccount } from '@/auth/Boundary';
import { isPersonalAiOwner } from '@/auth/client';
import TaskState, { useAiTasks } from '@/components/PersonalAi/TaskState';
import AnalysisPanel from '@/components/PersonalAi/AnalysisPanel';
import { consoleRequest, Task } from '@/components/PersonalAi/client';
import { mayLeaveResearch } from '@/utils/research-navigation';
import PageHeading from '@/auth/PageHeading';
import { RobotOutlined } from '@ant-design/icons';
import Settings from './Settings';
import TaskHistory from './TaskHistory';
import './workspace.css';
import '@/components/PersonalAi/personal-ai.css';
import '@/app/review/review.css';

const tabs = ['history', 'settings'];
function Workspace({ ownerId }: { ownerId: number }) {
  const params = useSearchParams();
  const router = useRouter();
  const context = useAiTasks();
  const [searchError, setSearchError] = useState('');
  const [selected, setSelected] = useState<Task | null>(null);
  const requested = params?.get('tab') || (params?.get('aiTask') ? 'history' : 'settings');
  const tab = tabs.includes(requested) ? requested : 'settings';
  const taskId = params?.get('aiTask') || '';
  useEffect(() => {
    if (requested === 'review') { const query = new URLSearchParams(params?.toString()); query.delete('tab'); query.set('view', 'article'); router.replace(`/review/?${query}`); }
  }, [requested, params, router]);
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
      <PageHeading title="AI 设置" description="配置复盘模型，管理用量并查看历史任务。" icon={<RobotOutlined />} />
      <Tabs
        activeKey={tab}
        onChange={(value) => { update({ tab: value, aiTask: '' }); }}
        items={[
          { key: 'settings', label: '模型设置' }, { key: 'history', label: '历史任务' },
        ]}
      />
      <Link href="/review/?view=article">前往每日复盘制作图文</Link>
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
            {selected?.skill === 'market-review' && selected.answer && <Button type="primary" onClick={() => { router.push(`/review/?view=article&date=${selected.date}&aiTask=${encodeURIComponent(selected.id)}`); }}>核对并应用到图文</Button>}
            {selected && <AnalysisPanel readOnly key={selected.id} ownerId={ownerId} skill={selected.skill} date={selected.date} strategy={selected.strategy} candidates={selected.codes.map((code) => ({ code }))} initialTaskId={selected.id} />}
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
