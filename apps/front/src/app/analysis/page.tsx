'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { EAnalysisAsideMenuKey } from '@/components/Layout/enum';

function AnalysisPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace(EAnalysisAsideMenuKey.analysisSenti);
  }, [router]);

  return null;
}

export default AnalysisPage;
