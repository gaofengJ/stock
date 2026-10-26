'use client';

import { useState } from 'react';
import {
  Alert, Button, Drawer, Space,
} from 'antd';
import Link from 'next/link';
import { useAccount } from '@/auth/Boundary';
import { useAiTasks } from './TaskState';
import { activeTask, statusNames, taskHref } from './client';
import AnalysisPanel from './AnalysisPanel';

export default function TaskBar() {
  const context = useAiTasks(); const { user } = useAccount(); const [open, setOpen] = useState(false);
  const task = context?.state?.tasks.find((row) => activeTask(row.status)) || context?.state?.tasks[0];
  if (!task || !user || (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('reviewCapture'))) return null;
  const settledType = task.status === 'completed' ? 'success' : 'warning';
  return (
    <>
      <Alert
        className="personal-ai-task-bar"
        type={activeTask(task.status) ? 'info' : settledType}
        message={(
          <Space wrap>
            <span>
              {task.date}
              {' '}
              {task.skill === 'market-review' ? '复盘' : '股票对比'}
              ：
              {statusNames[task.status]}
            </span>
            <Button size="small" onClick={() => setOpen(true)}>查看 AI 任务</Button>
            <Link href={taskHref(task)}>{task.skill === 'market-review' ? '回到复盘应用结果' : '回到策略查看结果'}</Link>
          </Space>
)}
      />
      <Drawer className="personal-ai-drawer" title="AI 任务与结果" width="min(1040px, 100vw)" styles={{ wrapper: { maxWidth: '100vw' } }} open={open} onClose={() => setOpen(false)} footer={<Button onClick={() => setOpen(false)}>关闭</Button>}>{open && <AnalysisPanel readOnly key={task.id} ownerId={user.id} skill={task.skill} date={task.date} strategy={task.strategy} candidates={task.codes.map((code) => ({ code }))} initialTaskId={task.id} />}</Drawer>
    </>
  );
}
