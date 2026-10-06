'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Alert, Button, Select, Space,
} from 'antd';
import { marketRequest } from '@/api/market';
import { SectorOptions } from '@/api/sectors';
import { errorMessage } from '@/api/errors';
import HelpTooltip from './HelpTooltip';
import { sectorDefinition, sectorKindLabel } from './sector-terminology';

export function useSectorSelection() {
  const params = useSearchParams();
  const linked = params.get('sector') || undefined;
  const [sector, setSector] = useState<string | undefined>(linked);
  useEffect(() => { setSector(linked); }, [linked]);
  return { sector, setSector };
}
export default function SectorFilter({ value, onChange }: { value?: string; onChange: (value?: string) => void }) {
  const [data, setData] = useState<SectorOptions | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    marketRequest<SectorOptions>('sector-options').then((r) => { if (active) { setData(r.data); setError(''); } }).catch((e) => { if (active) setError(errorMessage(e, '板块目录加载失败')); });
    return () => { active = false; };
  }, [attempt]);
  return (
    <Space size={6} wrap>
      <Select allowClear showSearch optionFilterProp="label" aria-label="同花顺行业或概念" placeholder="行业／概念" value={value} onChange={onChange} loading={!data && !error} style={{ width: 230 }} popupMatchSelectWidth={300} options={['I', 'N'].map((type) => ({ label: `同花顺${sectorKindLabel(type)}`, options: (data?.items || []).filter((s) => s.type === type).map((s) => ({ label: s.name, value: s.code })) }))} />
      <HelpTooltip label="行业和概念口径" title={`${sectorDefinition}统一使用同花顺成分${data?.asOf ? `，最近快照${String(data.asOf).slice(0, 10)}` : ''}。历史日期按可用快照筛选。`} />
      {error && <Alert type="error" message={error} action={<Button size="small" onClick={() => setAttempt((v) => v + 1)}>重试</Button>} />}
    </Space>
  );
}
