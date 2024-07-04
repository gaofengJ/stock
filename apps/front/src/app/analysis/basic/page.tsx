'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { EAnalysisAsideMenuKey } from '@/components/Layout/enum';
// import styles from './index.module.less';

function AnalysisBasicPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace(EAnalysisAsideMenuKey.analysisBasicDaily);
  }, [router]);

  return null;
}

export default AnalysisBasicPage;
