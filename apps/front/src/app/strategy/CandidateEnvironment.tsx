'use client';

import { useEffect, useState } from 'react';
import {
  Alert, Button, Card, Space, Skeleton,
} from 'antd';
import Link from 'next/link';
import { marketRequest, MarketStats, MarketBreadth } from '@/api/market';
import { errorMessage } from '@/api/errors';
import { useLatestRequest } from '@/hooks/useLatestRequest';
import { numberText } from '@/utils/format';
import HelpTooltip from '@/components/HelpTooltip';
import { useAccount } from '@/auth/Boundary';
import { allowedPath } from '@/auth/client';

interface Environment { date: string; market: MarketStats | null; breadth: MarketBreadth | null }

export default function CandidateEnvironment({ date }: { date: string }) {
  const [data, setData] = useState<Environment | null>(null);
  const [error, setError] = useState(''); const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(false); const { user } = useAccount();
  const { requestConfig, runLatestRequest } = useLatestRequest('candidate-environment');
  useEffect(() => {
    if (!date) return;
    runLatestRequest({
      request: () => marketRequest<Environment>('candidate-environment', { date }, requestConfig),
      onStart: () => { setLoading(true); setError(''); },
      onSuccess: (r) => setData(r.data),
      onError: (e) => setError(errorMessage(e, '环境数据加载失败')),
      onFinally: () => setLoading(false),
    });
  }, [date, attempt, requestConfig, runLatestRequest]);
  const current = data?.date === date ? data : null;
  const metrics = [
    { label: '上涨占比', value: current?.market?.upRatio, unit: '%' },
    { label: '站上20日线', value: current?.breadth?.ma20.ratio, unit: '%' },
    { label: '站上60日线', value: current?.breadth?.ma60.ratio, unit: '%' },
    { label: '市场成交额', value: current?.market?.amount, unit: '亿元' },
  ];
  return (
    <Card
      size="small"
      className="strategy-environment mb-16"
      title={(
        <Space>
          大盘环境
          <HelpTooltip label="大盘环境" title="沪深京全部A股，均线采用复权价格；仅作背景参考，不影响选股。" />
        </Space>
)}
      extra={date && allowedPath(user, '/analysis/overview') ? <Link href={`/analysis/overview/?date=${date}&scope=all`}>查看大盘</Link> : undefined}
    >
      {error ? <Alert type="warning" showIcon message={error} action={<Button size="small" onClick={() => setAttempt((v) => v + 1)}>重试</Button>} /> : (
        <div className="strategy-environment-grid" aria-busy={loading}>
          {metrics.map((metric) => (
            <div className="strategy-environment-metric" key={metric.label}>
              <span className="strategy-environment-label">{metric.label}</span>
              {loading || !date ? <Skeleton.Input active size="small" style={{ width: 100 }} /> : (
                <div className="strategy-environment-value">
                  <strong>{numberText(metric.value)}</strong>
                  {metric.value != null && <span className="strategy-environment-unit">{metric.unit}</span>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
