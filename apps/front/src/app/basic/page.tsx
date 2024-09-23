'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { EBasicAsideMenuKey } from '@/components/Layout/enum';

function AnalysisBasicPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace(EBasicAsideMenuKey.basicDaily);
  }, [router]);

  return null;
}

export default AnalysisBasicPage;
