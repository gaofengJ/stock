'use client';

import Layout from '@/components/Layout';
import { analysisSiderMenuItems } from '@/components/Layout/config';
import { EAnalysisAsideMenuKey, EHeaderMenuKey } from '@/components/Layout/enum';
// import styles from './index.module.less';

function AnalysisBasicDailyPage() {
  return (
    <Layout
      asideMenuItems={analysisSiderMenuItems}
      headerMenuActive={EHeaderMenuKey.analysis}
      asideMenuActive={EAnalysisAsideMenuKey.analysisBasicDaily}
      asideMenuOpen={EAnalysisAsideMenuKey.analysisBasic}
    >
      <div>Analysis Basic Daily</div>
    </Layout>
  );
}

export default AnalysisBasicDailyPage;
