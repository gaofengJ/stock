import {
  useCallback, useEffect, useRef, useState,
} from 'react';
import { Button, Collapse, Tag } from 'antd';
import request from '@/api/request';
import { ExternalLink } from '@/components/Interaction';
import RiskInspect from '../basic/components/RiskInspect';
import { SourceState } from '../basic/components/workbench';
import { currentReduction, reductionRiskLabel, riskTypeLabel } from '../basic/components/risk-display';
import { sourcePending, startWorkbenchPolling } from '../basic/components/workbench-polling';
import './candidate-risk.css';

type RiskRow = { tsCode: string; tags: { type: string; label: string; count: number }[]; sources: any[]; events?: { type: string; date: string; title: string; url?: string; detail?: string }[] };
type RiskResponse = { items: RiskRow[]; sources: any[] };

// One coordinator per table: off-screen cells never enqueue provider work.
export function useCandidateRisks(date: string, enabled: boolean) {
  const visible = useRef(new Set<string>());
  const [visibleKey, setVisibleKey] = useState('');
  const debounce = useRef<ReturnType<typeof setTimeout>>(undefined);
  const cache = useRef(new Map<string, { row: RiskRow; expires: number }>());
  const [rows, setRows] = useState(new Map<string, RiskRow>());
  const [failed, setFailed] = useState(false);
  const watch = useCallback((code: string, shown: boolean) => {
    if (shown) visible.current.add(code); else visible.current.delete(code);
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => setVisibleKey([...visible.current].sort().join(',')), 100);
  }, []);
  useEffect(() => () => clearTimeout(debounce.current), []);
  useEffect(() => {
    setRows(new Map());
    setFailed(false);
    if (!enabled || !date || !visibleKey) return undefined;
    const collected = new Map<string, RiskRow>();
    let pending = visibleKey.split(',').filter((code) => {
      const entry = cache.current.get(`${date}/${code}`);
      if (entry) collected.set(code, entry.row);
      return !entry || entry.expires < Date.now();
    });
    setRows(new Map(collected));
    if (!pending.length) return undefined;
    return startWorkbenchPolling({
      read: async (signal) => {
        const sources: any[] = [];
        const next: string[] = [];
        for (let i = 0; i < pending.length; i += 20) {
          // eslint-disable-next-line no-await-in-loop
          const { data } = await request.get<RiskResponse>('/strategy/candidate-risks', {
            params: { date, codes: pending.slice(i, i + 20).join(',') }, signal, timeout: 15000, autoShowError: false,
          });
          if (signal.aborted) return { sources: [] };
          data.items.forEach((row) => {
            const waiting = row.sources.some(sourcePending);
            const incomplete = row.sources.some((source) => source.state !== 'ready');
            let ttl = incomplete ? 30000 : 300000;
            if (waiting) ttl = 0;
            cache.current.set(`${date}/${row.tsCode}`, { row, expires: Date.now() + ttl });
            collected.set(row.tsCode, row);
            if (waiting) next.push(row.tsCode);
          });
          sources.push(...data.sources);
        }
        pending = next;
        // Bound client memory across long date/strategy browsing sessions.
        if (cache.current.size > 1000) [...cache.current.keys()].slice(0, cache.current.size - 1000).forEach((key) => cache.current.delete(key));
        return { sources };
      },
      onValue: () => setRows(new Map(collected)),
      onError: () => setFailed(true),
      onStopped: () => setFailed(true),
    });
  }, [date, enabled, visibleKey]);
  return { rows, failed, watch };
}

function RiskEvidence({ code, date }: { code: string; date: string }) {
  const [data, setData] = useState<RiskResponse>();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    setFailed(false);
    return startWorkbenchPolling<RiskResponse>({
      read: async (signal) => (await request.get<RiskResponse>('/strategy/candidate-risks', {
        params: { date, codes: code, detail: 'true' }, signal, timeout: 15000, autoShowError: false,
      })).data,
      onValue: setData,
      onError: () => setFailed(true),
      onStopped: () => setFailed(true),
    });
  }, [code, date, attempt]);
  const row = data?.items[0];
  return (
    <section className="candidate-risk-evidence">
      <h3>解禁、质押与公告线索</h3>
      <p className="basic-muted">公告覆盖观察日前180天，解禁查看未来30天已公告安排。标题线索不等于已确认或仍在持续的风险，澄清、结案等进展需结合原文核验。</p>
      {failed && <Button size="small" onClick={() => setAttempt((value) => value + 1)}>重新获取摘要</Button>}
      <SourceState data={data} retry={() => setAttempt((value) => value + 1)} pollingStopped={failed} />
      {row?.events?.length ? (
        <Collapse items={[...new Set(row.events.map((event) => event.type))].map((type) => ({
          key: type,
          label: `${type}（${row.events!.filter((event) => event.type === type).length}条）`,
          children: (
            <ul className="risk-evidence-list">
              {row.events!.filter((event) => event.type === type).map((event) => (
                <li key={`${event.date}-${event.title}`}>
                  <span className="basic-muted">
                    {event.date}
                    {' '}
                  </span>
                  {event.url ? <ExternalLink href={event.url} target="_blank" rel="noreferrer">{event.title}</ExternalLink> : event.title}
                  {event.detail && <p>{event.detail}</p>}
                </li>
              ))}
            </ul>
          ),
        }))}
        />
      ) : <p className="basic-muted">{!row || row.sources.some(sourcePending) ? '正在补齐资料，已取得的信息仍可在下方查看。' : '已取得资料中未见相关记录；尚未取得的类别不能据此排除风险。'}</p>}
    </section>
  );
}

export default function CandidateRisk({
  code, name, date, base, state,
}: { code: string; name: string; date: string; base: any; state: ReturnType<typeof useCandidateRisks> }) {
  const element = useRef<HTMLDivElement>(null);
  const { watch } = state;
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => watch(code, entry.isIntersecting));
    if (element.current) observer.observe(element.current);
    return () => { observer.disconnect(); watch(code, false); };
  }, [code, watch]);
  const row = state.rows.get(code);
  const existing = (base?.items || []).filter((item: any) => item.tsCode === code && (item.type !== '减持' || currentReduction(item, date))).map((item: any) => (item.type === '减持' ? reductionRiskLabel(item) : riskTypeLabel(item.type)));
  const labels = [...new Set<string>([...existing, ...(row?.tags || []).map((tag) => tag.label)])];
  const waiting = !row || row.sources.some(sourcePending);
  const partial = state.failed || row?.sources.some((source) => source.state !== 'ready') || !base?.sources?.length || base.sources.some((source: any) => source.state !== 'ready');
  let status = labels.length ? '查看风险资料' : '已获资料未见相关记录';
  if (partial) status = '部分资料待核验';
  if (waiting && !state.failed) status = '风险摘要补齐中';
  return (
    <div ref={element}>
      <RiskInspect
        code={code}
        name={name}
        date={date}
        extra={<RiskEvidence code={code} date={date} />}
        trigger={(
          <>
            <span className="candidate-risk-tags">
              {labels.slice(0, 3).map((label) => <Tag key={label} color="orange">{label}</Tag>)}
              {labels.length > 3 && (
              <span>
                +
                {labels.length - 3}
                项
              </span>
              )}
            </span>
            <span className="basic-muted">
              {status}
              {' '}
              ›
            </span>
          </>
      )}
      />
    </div>
  );
}
