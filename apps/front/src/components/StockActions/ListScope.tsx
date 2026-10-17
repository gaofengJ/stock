'use client';

import { createContext, useContext } from 'react';

export const StockListContext = createContext<() => readonly unknown[]>(() => []);
export const useStockList = () => useContext(StockListContext);
