'use client';

import {
  useCallback, useEffect, useMemo, useState,
} from 'react';
import { usePathname } from 'next/navigation';
import dynamic from 'next/dynamic';
import {
  Alert, Button, Input, Modal, message,
} from 'antd';
import Loading from '@/components/Loading';
import { useDefaultTradeDate } from '@/hooks/useDefaultTradeDate';
import { trendDefaults } from '@/app/strategy/strategy-options';
import { copyText } from '@/utils/clipboard';
import { stockDate, stockSymbol, validStockCode } from '@/utils/stock-interaction';
import { ChartSelection, StockActionContext } from './context';

const StockChart = dynamic(() => import('@/app/strategy/StockChart'), { ssr: false, loading: () => <Loading height={160} /> });

/** One chart and one clipboard fallback for the whole platform, loaded only on demand. */
export default function StockActionProvider({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [selection, setSelection] = useState<ChartSelection | null>(null);
  const [manual, setManual] = useState<string | null>(null);
  const [api, contextHolder] = message.useMessage();
  const fallback = useDefaultTradeDate(!!selection && !selection.date);
  const date = selection?.date || (fallback.ready ? fallback.tradeDate : '');
  useEffect(() => { setSelection(null); setManual(null); }, [path]);
  const openChart = useCallback((stock: ChartSelection) => {
    if (validStockCode(stock.code)) setSelection({ ...stock, date: stockDate(stock.date) });
  }, []);
  const copyCode = useCallback(async (code: string) => {
    if (!validStockCode(code)) return;
    const symbol = stockSymbol(code);
    if (await copyText(symbol)) api.success(`已复制代码：${symbol}`);
    else setManual(symbol);
  }, [api]);
  const actions = useMemo(() => ({ openChart, copyCode }), [openChart, copyCode]);
  return (
    <StockActionContext.Provider value={actions}>
      {children}
      {contextHolder}
      {selection && date && (
        <StockChart key={`${selection.code}-${date}`} neutral stock={{ tsCode: selection.code, name: selection.name }} date={date} strategy="fiveMaUp" options={trendDefaults} onClose={() => setSelection(null)} />
      )}
      <Modal open={!!selection && !date} title="查看K线" footer={null} onCancel={() => setSelection(null)}>
        {fallback.error ? <Alert type="error" message={fallback.error} action={<Button onClick={fallback.retry}>重试交易日期</Button>} /> : <Loading height={160} />}
      </Modal>
      <Modal open={manual !== null} title="手动复制股票代码" onCancel={() => setManual(null)} footer={<Button onClick={() => setManual(null)}>完成</Button>} width={400} destroyOnClose>
        <p>自动复制未成功，请选中文本后按 Ctrl+C（Mac 使用 ⌘C），或长按复制。</p>
        <Input key={manual} aria-label="待复制的股票代码" value={manual || ''} readOnly autoFocus onFocus={(event) => event.target.select()} />
      </Modal>
    </StockActionContext.Provider>
  );
}
