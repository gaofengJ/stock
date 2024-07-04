'use client';

import Layout from '@/components/Layout';
import { analysisSiderMenuItems } from '@/components/Layout/config';
import { EAnalysisAsideMenuKey, EHeaderMenuKey } from '@/components/Layout/enum';
// import styles from './index.module.less';

function ChainsPage() {
  return (
    <Layout
      asideMenuItems={analysisSiderMenuItems}
      headerMenuActive={EHeaderMenuKey.analysis}
      asideMenuActive={EAnalysisAsideMenuKey.analysisSenti}
    >
      <div>Analysis Chains</div>
    </Layout>
  );
}

export default ChainsPage;
