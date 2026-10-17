'use client';

import { Alert, Button } from 'antd';
import { beijingTime } from '@/utils/format';
import { errorMessage } from '@/api/errors';
import { sourceNames } from '../../basic/components/source-display';
import type { WorkbenchSource } from '../../basic/components/workbench-polling';

export default function RiskStatus({
  data, loading, error, retry, pollingStopped = false, recovering = false,
}: { data: { sources?: WorkbenchSource[] } | null; loading: boolean; error: string; retry: () => void; pollingStopped?: boolean; recovering?: boolean }) {
  const pending = data?.sources?.filter((source) => source.state !== 'ready') || [];
  const unavailable = pending.some((source) => !!source.message || source.state === 'error');
  if (error || loading || !data || pending.length) {
    let message = pending.length ? '部分风险资料正在刷新' : '风险资料加载中';
    if (pollingStopped) message = '部分风险资料尚未就绪';
    if (unavailable) message = '部分风险资料刷新失败';
    if (recovering) message = '风险资料连接暂时中断，正在自动重试';
    if (error) message = data ? '风险资料更新失败，保留已获取资料' : '风险资料查询失败';
    return (
      <Alert
        className="limits-risk-status"
        type={error || unavailable ? 'warning' : 'info'}
        showIcon
        message={message}
        description={(
          <div>
            {error && <div>{errorMessage(error, '查询暂时失败，请稍后重试')}</div>}
            {pending.map((source) => (
              <div key={source.source} className="limits-risk-source">
                <span>{`${sourceNames[source.source] || '其他风险资料'}：${source.message || (pollingStopped ? '尚未就绪' : '正在刷新')}`}</span>
                <span>{source.fetchedAt ? `最后成功：${beijingTime(source.fetchedAt)}（北京时间）` : '尚无可用快照'}</span>
                {source.nextRetryAt && <span>{`可重试时间：${beijingTime(source.nextRetryAt)}（北京时间）`}</span>}
              </div>
            ))}
            <span>{data ? '已获取的风险事件显示在风险提示列，未就绪来源不代表没有风险。' : '风险资料尚未加载，风险提示列的空值不代表没有风险。'}</span>
          </div>
        )}
        action={<Button size="small" loading={loading} onClick={retry}>检查更新</Button>}
      />
    );
  }
  return <p className="limits-risk-note">风险资料已加载。风险提示列展示已识别的风险事件，标签覆盖范围以已取得的资料为限。</p>;
}
