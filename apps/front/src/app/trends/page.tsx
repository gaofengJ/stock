'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAccount } from '@/auth/Boundary';
import { allowedPath } from '@/auth/client';
import Loading from '@/components/Loading';
import PreparedPage from '@/components/PreparedPage';

export default function Page() {
  const { user } = useAccount();
  const router = useRouter();
  const overview = allowedPath(user, '/analysis/overview');
  useEffect(() => {
    if (overview) router.replace(`/analysis/overview/${window.location.search}${window.location.hash}`);
  }, [overview, router]);
  if (!user || overview) return <Loading />;
  return <PreparedPage title="市场行情（筹备中）" menu="/trends" />;
}
