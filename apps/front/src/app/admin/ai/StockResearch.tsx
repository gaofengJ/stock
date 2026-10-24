'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Button, Card, Select, Spin,
} from 'antd';
import { api } from '@/auth/client';
import SelectField from '@/components/SelectField';
import AnalysisPanel, { Candidate } from '@/components/PersonalAi/AnalysisPanel';
import { StrategyContext } from '@/components/PersonalAi/client';
import { isTrendStrategy, trendDefaults } from '@/app/strategy/strategy-options';
import { turnoverStrategies } from '@/app/strategy/strategy-state';

export default function StockResearch({
  ownerId, date, type, onTypeChange,
}: { ownerId: number; date: string; type: string; onTypeChange: (value: string) => void }) {
  const [strategies, setStrategies] = useState<{ key: string; label: string }[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const strategy = useMemo<StrategyContext>(() => ({
    type,
    parameters: { ...(isTrendStrategy(type) ? trendDefaults : {}), ...(turnoverStrategies.includes(type) ? { minTurnoverRateF: 5 } : {}) },
  }), [type]);
  useEffect(() => {
    let active = true;
    api<{ key: string; label?: string; name?: string }[]>('/strategy/tabs-list')
      .then((rows) => { if (active) { setStrategies(rows.map((row) => ({ key: row.key, label: row.label || row.name || row.key }))); if (!type) onTypeChange(rows[0]?.key || ''); if (!rows.length) { setError('暂无可用策略'); setLoading(false); } } })
      .catch(() => { if (active) { setError('策略读取失败，请重试'); setLoading(false); } });
    return () => { active = false; };
  }, [retry, type, onTypeChange]);
  useEffect(() => {
    if (!type) return undefined;
    let active = true;
    setLoading(true); setError(''); setCandidates([]);
    const query = new URLSearchParams({
      date, strategyType: type, includeLabels: 'false', ...Object.fromEntries(Object.entries(strategy.parameters).map(([key, value]) => [key, String(value)])),
    });
    api<{ tsCode: string; name: string }[]>(`/strategy/list?${query}`)
      .then((rows) => { if (active) setCandidates(rows.map((row) => ({ code: row.tsCode, name: row.name }))); })
      .catch(() => { if (active) setError('候选股票读取失败，请重试'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [type, date, strategy, retry]);
  return (
    <div className="personal-ai-stack">
      <Card size="small" title="选择研究范围">
        <div className="personal-ai-stack">
          <SelectField label="选股策略"><Select aria-label="选股策略" value={type || undefined} placeholder="选择策略" onChange={onTypeChange} options={strategies.map((row) => ({ value: row.key, label: row.label }))} style={{ width: 240, maxWidth: '100%' }} /></SelectField>
          <p className="personal-ai-caption">使用所选日期和策略的默认筛选条件。选择 1 至 3 只候选股票，填写研究重点后开始对比。</p>
        </div>
      </Card>
      {error && <Alert type="error" message={error} action={<Button onClick={() => setRetry((old) => old + 1)}>重试</Button>} />}
      {loading && <Spin tip="正在读取候选股票"><div style={{ height: 80 }} /></Spin>}
      {!loading && !error && !candidates.length && <Alert type="info" message="当前策略和日期没有候选股票，请更换策略或研究日期。" />}
      {!loading && !error && candidates.length > 0 && <AnalysisPanel key={`${date}:${type}`} ownerId={ownerId} skill="candidate-compare" date={date} strategy={strategy} candidates={candidates} />}
    </div>
  );
}
