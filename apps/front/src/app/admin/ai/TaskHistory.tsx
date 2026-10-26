'use client';

import { useState } from 'react';
import {
  Button, Input, Select, Tag,
} from 'antd';
import Table from '@/components/DataTable';
import SelectField from '@/components/SelectField';
import { InteractionButton } from '@/components/Interaction';
import {
  activeTask, modelNames, statusNames, Task,
} from '@/components/PersonalAi/client';

export default function TaskHistory({
  tasks, loading, selectedId, onSelect, onRefresh,
}: {
  tasks: Task[]; loading: boolean; selectedId?: string; onSelect: (task: Task) => void; onRefresh: () => Promise<unknown>;
}) {
  const [keyword, setKeyword] = useState('');
  const [skill, setSkill] = useState<string>();
  const [status, setStatus] = useState<string>();
  const [page, setPage] = useState(1);
  const [refreshing, setRefreshing] = useState(false);
  const rows = tasks.filter((task) => (!skill || task.skill === skill) && (!status || task.status === status)
    && (!keyword.trim() || `${task.date} ${task.message} ${task.codes.join(' ')} ${task.id}`.toLowerCase().includes(keyword.trim().toLowerCase())));
  return (
    <section className="ai-history">
      <div className="ai-history-toolbar">
        <Input.Search aria-label="搜索 AI 任务" placeholder="搜索日期、股票或分析要求" value={keyword} allowClear onChange={(event) => { setKeyword(event.target.value); setPage(1); }} />
        <SelectField label="任务类型"><Select value={skill} allowClear placeholder="全部" onChange={(value) => { setSkill(value); setPage(1); }} options={[{ value: 'candidate-compare', label: '历史股票对比' }, { value: 'market-review', label: '图文复盘' }]} /></SelectField>
        <SelectField label="任务状态"><Select value={status} allowClear placeholder="全部" onChange={(value) => { setStatus(value); setPage(1); }} options={Object.entries(statusNames).map(([value, label]) => ({ value, label }))} /></SelectField>
        <Button loading={refreshing} onClick={async () => { setRefreshing(true); try { await onRefresh(); } catch { /* The task provider displays the request error. */ } finally { setRefreshing(false); } }}>刷新</Button>
      </div>
      <div className="ai-list-summary">
        <span>{`共 ${rows.length} 条记录`}</span>
        <span>任务在服务器执行，离开页面后仍会继续。</span>
      </div>
      <Table<Task>
        rowKey="id"
        autoHeight
        loading={loading}
        size="middle"
        dataSource={rows}
        scroll={{ x: 920 }}
        rowClassName={(task) => (task.id === selectedId ? 'interaction-selected-row' : '')}
        locale={{ emptyText: tasks.length ? '没有符合筛选条件的任务' : '暂无分析任务，请在每日复盘中生成图文。' }}
        pagination={{
          current: Math.min(page, Math.max(1, Math.ceil(rows.length / 10))), pageSize: 10, showSizeChanger: false, hideOnSinglePage: true, onChange: setPage, showTotal: (total) => `共 ${total} 条`,
        }}
        columns={[
          { title: '研究日期', dataIndex: 'date', width: 112 },
          { title: '任务类型', width: 112, render: (_, task) => (task.skill === 'market-review' ? '图文复盘' : '历史股票对比') },
          {
            title: '分析内容',
            width: 300,
            render: (_, task) => (
              <div className="ai-task-summary">
                <strong>{task.codes.join('、') || '市场复盘'}</strong>
                <span>{task.message || '使用默认分析要求'}</span>
              </div>
            ),
          },
          { title: '状态', width: 120, render: (_, task) => <Tag color={activeTask(task.status) ? 'processing' : ({ completed: 'success', failed: 'error', interrupted: 'warning' } as Record<string, string>)[task.status]}>{statusNames[task.status] || task.status}</Tag> },
          {
            title: '模型',
            width: 150,
            render: (_, task) => (
              <div className="ai-task-summary">
                <span>{modelNames[task.model] || task.model}</span>
                <small>{task.effort}</small>
              </div>
            ),
          },
          { title: '提交时间（北京）', width: 178, render: (_, task) => new Date(task.createdAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) },
          {
            title: '操作', width: 96, fixed: 'right', render: (_, task) => <InteractionButton intent="preview" onClick={() => onSelect(task)}>查看详情</InteractionButton>,
          },
        ]}
      />
    </section>
  );
}
