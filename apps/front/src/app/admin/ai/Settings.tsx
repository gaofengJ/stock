'use client';

import { useEffect, useState } from 'react';
import {
  Alert, Button, Card, Space, Typography,
} from 'antd';
import { SettingOutlined } from '@ant-design/icons';
import PageHeading from '@/auth/PageHeading';
import ModelControls from '@/components/PersonalAi/ModelControls';
import {
  ConsoleState, consoleRequest, defaultChoice, Metadata, ModelChoice, readChoice, saveChoice, supportsChoice,
} from '@/components/PersonalAi/client';
import '@/components/PersonalAi/personal-ai.css';

export default function Settings({ ownerId }: { ownerId: number }) {
  const [state, setState] = useState<ConsoleState | null>(null);
  const [choice, setChoice] = useState<ModelChoice>(defaultChoice);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const load = async () => setState(await consoleRequest<ConsoleState>('/status'));
  useEffect(() => {
    let active = true;
    setChoice(readChoice(ownerId));
    consoleRequest<ConsoleState>('/status').then((value) => { if (active) setState(value); }).catch((reason) => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, [ownerId]);
  const metadata = state?.metadata;
  const remaining = metadata?.quota.primary ? `${Math.max(0, 100 - metadata.quota.primary.usedPercent)}%` : '尚未查询';
  return (
    <div className="personal-ai-stack personal-ai-settings">
      <PageHeading title="模型设置" description="管理个人分析的默认模型，查看订阅状态和用量。" icon={<SettingOutlined />} />
      {error && <Alert type="error" showIcon message={error} action={<Button size="small" onClick={() => { setError(''); load().catch((reason) => setError(reason.message)); }}>重试</Button>} />}
      {notice && <Alert type="success" showIcon message={notice} />}
      <div className="personal-ai-metrics">
        <div className="personal-ai-metric">
          <span>今日分析次数</span>
          <strong>{state ? `${state.today.calls} / ${state.limits.dailyCalls}` : '—'}</strong>
        </div>
        <div className="personal-ai-metric">
          <span>今日 Token 预算占用</span>
          <strong>{state?.today.tokens.toLocaleString() ?? '—'}</strong>
          <span>
            每日准入预算
            {state?.limits.dailyTokens.toLocaleString() ?? '200,000'}
          </span>
        </div>
        <div className="personal-ai-metric">
          <span>订阅窗口剩余额度</span>
          <strong>{remaining}</strong>
          <span>{metadata ? '最近一次查询结果' : '点击下方刷新订阅状态'}</span>
        </div>
      </div>
      <Card size="small" title="默认模型">
        <div className="personal-ai-stack">
          <ModelControls value={choice} onChange={(value) => { setChoice(value); setNotice(''); }} metadata={metadata} />
          <Typography.Text type="secondary">初始默认为 GPT-6.1 Sol / High。设置保存在当前浏览器，仅用于你的账号；每次分析仍可单独选择。</Typography.Text>
          <Space wrap>
            <Button
              type="primary"
              disabled={!supportsChoice(metadata, choice)}
              onClick={() => {
                try { saveChoice(ownerId, choice); setNotice('默认模型已保存，重新打开分析面板后生效。'); setError(''); } catch { setError('浏览器未允许保存设置，请在每次分析时选择模型。'); }
              }}
            >
              保存设置
            </Button>
            <Button onClick={() => { setChoice(defaultChoice); setNotice('已恢复默认选择，点击保存设置后生效。'); }}>恢复默认</Button>
          </Space>
        </div>
      </Card>
      <Card
        size="small"
        title="订阅状态"
        extra={(
          <Button
            loading={busy}
            onClick={async () => {
              setBusy(true); setError(''); setNotice('');
              try { await consoleRequest<Metadata>('/account', 'POST', {}); await load(); setNotice('订阅状态、模型目录与额度已刷新，未调用模型。'); } catch (reason) { setError(reason instanceof Error ? reason.message : '状态刷新失败，请稍后重试。'); } finally { setBusy(false); }
            }}
          >
            刷新状态
          </Button>
)}
      >
        <div className="personal-ai-stack">
          <Typography.Text>{metadata ? `已登录 ${metadata.plan.toUpperCase()} 订阅` : '订阅状态尚未查询'}</Typography.Text>
          <Typography.Text type="secondary">仅刷新登录与额度信息，不发起分析，不购买 credits。</Typography.Text>
        </div>
      </Card>
      <Typography.Paragraph type="secondary">仅本人管理员可用。每次手动分析才消耗订阅用量，单次最多运行180秒，同时只执行1个任务。Token预算是准入控制，执行中的任务可能超过预留量。凭据保留在服务器，不发送到页面；不使用 API Key，不自动购买 credits。</Typography.Paragraph>
    </div>
  );
}
