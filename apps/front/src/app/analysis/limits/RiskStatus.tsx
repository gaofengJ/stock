'use client';

import { Alert, Button } from 'antd';

interface RiskSource { state: string; message?: string }
export default function RiskStatus({
  data, loading, error, retry,
}: { data: { sources?: RiskSource[] } | null; loading: boolean; error: string; retry: () => void }) {
  const pending = data?.sources?.filter((source) => source.state !== 'ready') || [];
  const unavailable = pending.some((source) => !!source.message || source.state === 'error');
  if (error || unavailable) {
    return <Alert className="limits-risk-status" type="warning" showIcon message={error ? '风险资料查询失败' : '部分风险来源暂不可用'} description="股票旁仅展示已获取的风险事件；未显示标签不代表无风险。" action={<Button size="small" onClick={retry}>重试风险查询</Button>} />;
  }
  if (loading || !data || pending.length) {
    return <Alert className="limits-risk-status" type="info" showIcon message={pending.length ? '部分风险资料待补齐' : '风险资料加载中'} description="这是风险数据源的状态，不是个股风险结论。已获取的风险事件显示在股票名称下方。" action={!loading && <Button size="small" onClick={retry}>刷新风险资料</Button>} />;
  }
  return <p className="limits-risk-note">风险资料已加载；股票名称下方仅显示已识别的风险事件，未显示标签不代表无风险。</p>;
}
