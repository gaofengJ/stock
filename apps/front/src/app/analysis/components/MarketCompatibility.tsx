'use client';

import Loading from '@/components/Loading';

import { Alert } from 'antd';
import { useMarket } from './MarketContext';

/** 新数据发布之前保留原有查询能力，不能让新增数据集阻断已有页面。 */
export default function MarketCompatibility({
  legacy, children,
}: { legacy: React.ReactElement; children: React.ReactElement }) {
  const { status, error } = useMarket();
  if (status?.latestDate) return children;
  if (!status && !error) return <Loading height="100dvh" />;
  return legacy;
}

export function LegacyNotice() {
  return (
    <Alert
      className="mb-16"
      type="info"
      showIcon
      message="当前展示原有市场数据；新版分市场统计将在首次同步完成后启用。"
    />
  );
}
