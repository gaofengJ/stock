'use client';

import { createContext, useContext } from 'react';

export interface ChartSelection { code: string; name?: string; date?: string }
interface Actions {
  openChart: (stock: ChartSelection) => void;
  copyCode: (code: string) => Promise<void>;
}
export const StockActionContext = createContext<Actions | null>(null);
export function useStockActions() {
  const actions = useContext(StockActionContext);
  if (!actions) throw new Error('股票操作需要 StockActionProvider');
  return actions;
}
