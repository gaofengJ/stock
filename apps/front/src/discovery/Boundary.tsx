'use client';

/* eslint-disable react/jsx-no-useless-fragment -- A fragment keeps ReactNode children valid JSX without adding a layout wrapper. */
import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import AccountBoundary from '@/auth/Boundary';
import StockActionProvider from '@/components/StockActions/Provider';
import { isDiscoveryPath } from './site';

export default function DiscoveryBoundary({ children }: { children: ReactNode }) {
  const path = usePathname();
  return isDiscoveryPath(path) || path.replace(/\/$/, '') === '/domain-transfer' ? <>{children}</> : <AccountBoundary><StockActionProvider>{children}</StockActionProvider></AccountBoundary>;
}
