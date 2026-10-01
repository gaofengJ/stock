'use client';

import { useEffect, useState } from 'react';
import {
  Alert, Button, Card, Space,
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
  const ratio = (v: number | null | undefined) => `${numberText(v)}${v == null ? '' : '%'}`;
  return (
    <Card
      size="small"
      className="mb-16"
      title={(
        <Space>
          大盘环境
          <HelpTooltip label="大盘环境" title="沪深京全部A股，均线采用复权价格；仅作背景参考，不影响选股。" />
        </Space>
)}
      extra={allowedPath(user, '/analysis/overview') ? <Link href={`/analysis/overview/?date=${date}&scope=all`}>查看大盘</Link> : undefined}
    >
      {error ? <Alert type="warning" showIcon message={error} action={<Button size="small" onClick={() => setAttempt((v) => v + 1)}>重试</Button>} /> : (
        <Space wrap size={24}>
          <span>{date}</span>
          {loading ? <span>加载中…</span> : (
            <>
              <span>
                上涨占比
                {ratio(current?.market?.upRatio)}
              </span>
              <span>
                站上MA20
                {ratio(current?.breadth?.ma20.ratio)}
              </span>
              <span>
                站上MA60
                {ratio(current?.breadth?.ma60.ratio)}
              </span>
              <span>
                成交额
                {numberText(current?.market?.amount)}
                {current?.market ? '亿元' : ''}
              </span>
            </>
          )}
        </Space>
      )}
    </Card>
  );
}
