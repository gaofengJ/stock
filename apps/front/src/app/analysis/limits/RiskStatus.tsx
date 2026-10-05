'use client';

import { Alert, Button } from 'antd';

interface RiskSource { state: string; message?: string }
export default function RiskStatus({
  data, loading, error, retry,
}: { data: { sources?: RiskSource[] } | null; loading: boolean; error: string; retry: () => void }) {
  const pending = data?.sources?.filter((source) => source.state !== 'ready') || [];
  const unavailable = pending.some((source) => !!source.message || source.state === 'error');
  if (error || unavailable) {
    return <Alert className="limits-risk-status" type="warning" showIcon message={error ? '风险资料查询失败' : '部分风险来源暂不可用'} description="股票名称下方展示已获取的风险事件，其他事项待资料补齐后核验。" action={<Button size="small" onClick={retry}>重试风险查询</Button>} />;
  }
  if (loading || !data || pending.length) {
    return <Alert className="limits-risk-status" type="info" showIcon message={pending.length ? '部分风险资料待补齐' : '风险资料加载中'} description="正在获取风险资料，已识别的风险事件显示在股票名称下方。" action={!loading && <Button size="small" onClick={retry}>刷新风险资料</Button>} />;
  }
  return <p className="limits-risk-note">风险资料已加载。股票名称下方展示已识别的风险事件，标签覆盖范围以已取得的资料为限。</p>;
}
