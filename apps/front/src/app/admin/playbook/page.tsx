'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Skeleton } from 'antd';

export default function Page() {
  const router = useRouter();
  useEffect(() => { router.replace('/trading-system/'); }, [router]);
  return <Skeleton active paragraph={{ rows: 4 }} />;
}
