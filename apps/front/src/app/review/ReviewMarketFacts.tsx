'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { marketRequest, MarketSeries, MarketStats } from '@/api/market';
import { allowedPath } from '@/auth/client';
import { useAccount } from '@/auth/Boundary';
import { numberText } from '@/utils/format';
import type { ThemeBoard } from '../analysis/limits/theme-review.types';

export default function ReviewMarketFacts({ date }: { date: string }) {
  const { user } = useAccount();
  const overview = allowedPath(user, '/analysis/overview');
  const limits = allowedPath(user, '/analysis/limits');
  const [market, setMarket] = useState<MarketStats | null>(null);
  const [previous, setPrevious] = useState<number | null>(null);
  const [themes, setThemes] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    const config = { signal: controller.signal, autoShowError: false };
    const query = { date, scope: 'all' };
    const show = (day: string | null) => day === date && !controller.signal.aborted;
    if (overview) {
      marketRequest<MarketSeries>('overview', query, config).then(({ data }) => {
        if (show(data.date)) { setMarket(data.snapshot); setPrevious(data.previousAmount ?? null); }
      }).catch(() => {});
    } else {
      marketRequest<{ date: string; market: MarketStats }>('candidate-environment', query, config).then(({ data }) => {
        if (show(data.date)) setMarket(data.market);
      }).catch(() => {});
    }
    if (limits) {
      marketRequest<ThemeBoard>('theme-review', query, config).then(({ data }) => {
        if (show(data.date) && data.ready) {
          const ranked = data.groups.filter((group) => group.count > 0).sort((a, b) => b.count - a.count);
          setThemes(ranked.slice(0, 3).map((group) => `${group.name}（${group.count} 家）`).join('、') || (data.total === 0 ? '当日无涨停' : '暂缺'));
        }
      }).catch(() => {});
    }
    return () => controller.abort();
  }, [date, overview, limits]);
  const amount = market?.amount;
  const change = amount != null && previous != null ? numberText(amount - previous) : '暂缺';
  return (
    <section className="review-market-facts" aria-label="当日市场数据">
      <strong>{date}</strong>
      <span>{`成交额 ${amount != null ? `${numberText(amount)} 亿元` : '暂缺'}`}</span>
      <span>{`较上日 ${change}${change === '暂缺' ? '' : ' 亿元'}`}</span>
      <span>{`上涨 ${market?.up ?? '暂缺'} / 下跌 ${market?.down ?? '暂缺'}`}</span>
      {limits && <span>{`涨停题材：${themes || '暂缺'}`}</span>}
      {overview && <Link href={`/analysis/overview/?date=${date}`} target="_blank" rel="noreferrer">查看市场概览</Link>}
    </section>
  );
}
