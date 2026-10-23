'use client';

import { useEffect, useState } from 'react';
import {
  Button, Drawer, Empty, Space, message,
} from 'antd';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useAccount } from '@/auth/Boundary';
import { useDefaultTradeDate } from '@/hooks/useDefaultTradeDate';
import { CollectedItem } from '@/app/review/workspace-contract';
import {
  collectItem, collectionEvent, readCollection, writeCollection,
} from './store';

export function useCollection(owner: number, date: string) {
  const [items, setItems] = useState<CollectedItem[]>([]);
  useEffect(() => {
    const refresh = () => { try { setItems(owner && date ? readCollection(owner, date) : []); } catch { setItems([]); } };
    refresh(); window.addEventListener(collectionEvent, refresh); window.addEventListener('storage', refresh);
    return () => { window.removeEventListener(collectionEvent, refresh); window.removeEventListener('storage', refresh); };
  }, [owner, date]);
  return items;
}
export function CollectButton({ item, label = '收录到本日复盘' }: { item: Omit<CollectedItem, 'createdAt'>; label?: string }) {
  const { user } = useAccount(); const pending = useCollection(user?.id || 0, item.date);
  if (!user?.roles.some((role) => role.code === 'admin') || user.guest || !item.date) return null;
  const collected = pending.some((row) => row.id === item.id);
  return (
    <Button
      size="small"
      onClick={() => {
        try {
          if (collected) writeCollection(user.id, item.date, pending.filter((row) => row.id !== item.id));
          else { const revision = item.kind === 'chart' ? document.querySelector<HTMLElement>('[data-capture-revision]')?.dataset.captureRevision : ''; collectItem(user.id, { ...item, ...(revision ? { note: `${item.note}\n数据版本：${revision}`, url: `${item.url}${item.url.includes('?') ? '&' : '?'}dataRevision=${encodeURIComponent(revision)}` } : {}), createdAt: new Date().toISOString() }); }
          message.success(collected ? '已撤回待收录素材' : `已加入 ${item.date} 复盘，回到复盘后保存即可同步`);
        } catch (error) { message.error((error as Error).message || '本机空间不足，素材未收录'); }
      }}
    >
      {collected ? '已收录，点击撤回' : label}
    </Button>
  );
}
export default function ResearchCollection() {
  const { user } = useAccount(); const params = useSearchParams(); const path = usePathname();
  const fallback = useDefaultTradeDate();
  const defaultDate = path.startsWith('/news') ? new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10) : fallback.tradeDate;
  const date = params.get('date') || defaultDate || '';
  const items = useCollection(user?.id || 0, date); const [open, setOpen] = useState(false);
  const supported = /^\/(analysis|strategy|basic|review|news)(\/|$)/.test(path);
  if (!supported || !user?.roles.some((role) => role.code === 'admin') || user.guest || !date || params.has('reviewCapture')) return null;
  return (
    <>
      <div className="research-context-bar">
        <Space wrap>
          <span>
            研究日期：
            {date}
          </span>
          <Link href={`/review/?date=${date}`}>返回本日复盘</Link>
          <Button size="small" onClick={() => setOpen(true)}>
            待收录素材（
            {items.length}
            ）
          </Button>
          {path.startsWith('/analysis/') && (
          <CollectButton
            item={{
              id: `chart:${path}:${params}`,
              kind: 'chart',
              date,
              title: `图表证据：${({
                overview: '市场概览', senti: '情绪指标', chains: '连板分析', sectors: '板块轮动', limits: '涨停题材',
              } as Record<string, string>)[path.split('/').filter(Boolean).pop() || ''] || '市场分析'}`,
              url: `${path}?${params}`,
              note: '保留当前日期与图表筛选条件，打开原页面核验。',
            }}
            label="收录当前图表页面"
          />
          )}
        </Space>
      </div>
      <Drawer title={`${date} 待收录素材`} open={open} onClose={() => setOpen(false)} width={520}>
        <p>素材保存在本机，进入当日复盘并保存后可跨设备恢复。收录不会替换正文。</p>
        {items.length ? items.map((item) => (
          <div className="research-item" key={item.id}>
            <strong>{item.title}</strong>
            <p><a href={item.url} target="_blank" rel="noreferrer">查看来源</a></p>
            <p style={{ whiteSpace: 'pre-wrap' }}>{item.note}</p>
            <span>进入复盘后可编辑备注。</span>
            <Button type="text" onClick={() => { writeCollection(user.id, date, items.filter((row) => row.id !== item.id)); }}>撤回收录</Button>
          </div>
        )) : <Empty description="暂无待收录素材，可从股票、资讯或图表加入" />}
        <Link href={`/review/?date=${date}`}>前往复盘整理与保存</Link>
      </Drawer>
    </>
  );
}
