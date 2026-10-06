'use client';

/* eslint-disable react/jsx-no-useless-fragment -- A fragment keeps ReactNode children valid JSX without adding a layout wrapper. */
import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import AccountBoundary from '@/auth/Boundary';
import { isDiscoveryPath } from './site';

export default function DiscoveryBoundary({ children }: { children: ReactNode }) {
  return isDiscoveryPath(usePathname()) ? <>{children}</> : <AccountBoundary>{children}</AccountBoundary>;
}
