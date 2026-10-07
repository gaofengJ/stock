'use client';

import { Alert, Button } from 'antd';
import { beijingTime } from '@/utils/format';
import { sourceNames } from '../../basic/components/source-display';
import type { WorkbenchSource } from '../../basic/components/workbench-polling';

export default function RiskStatus({
  data, loading, error, retry, pollingStopped = false,
}: { data: { sources?: WorkbenchSource[] } | null; loading: boolean; error: string; retry: () => void; pollingStopped?: boolean }) {
  const pending = data?.sources?.filter((source) => source.state !== 'ready') || [];
  const unavailable = pending.some((source) => !!source.message || source.state === 'error');
  if (error || loading || !data || pending.length) {
    let message = pending.length ? '部分风险资料正在刷新' : '风险资料加载中';
    if (pollingStopped) message = '部分风险资料尚未就绪';
    if (unavailable) message = '部分风险资料刷新失败';
    if (error) message = '风险资料查询失败';
    return (
      <Alert
        className="limits-risk-status"
        type={error || unavailable ? 'warning' : 'info'}
        showIcon
        message={message}
        description={(
          <div>
            {pending.map((source) => (
              <div key={source.source} className="limits-risk-source">
                <span>{`${sourceNames[source.source] || '其他风险资料'}：${source.message || (pollingStopped ? '尚未就绪' : '正在刷新')}`}</span>
                <span>{source.fetchedAt ? `最后成功：${beijingTime(source.fetchedAt)}（北京时间）` : '尚无可用快照'}</span>
                {source.nextRetryAt && <span>{`可重试时间：${beijingTime(source.nextRetryAt)}（北京时间）`}</span>}
              </div>
            ))}
            <span>已获取的风险事件仍显示在股票名称下方，未就绪来源不代表没有风险。</span>
          </div>
        )}
        action={<Button size="small" loading={loading} onClick={retry}>检查更新</Button>}
      />
    );
  }
  return <p className="limits-risk-note">风险资料已加载。股票名称下方展示已识别的风险事件，标签覆盖范围以已取得的资料为限。</p>;
}
