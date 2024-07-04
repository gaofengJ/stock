'use client';

import Layout from '@/components/Layout';
import { analysisSiderMenuItems } from '@/components/Layout/config';
import { EAnalysisAsideMenuKey, EHeaderMenuKey } from '@/components/Layout/enum';
// import styles from './index.module.less';

function AnalysisBasicStockPage() {
  return (
    <Layout
      asideMenuItems={analysisSiderMenuItems}
      headerMenuActive={EHeaderMenuKey.analysis}
      asideMenuActive={EAnalysisAsideMenuKey.analysisBasicStock}
      asideMenuOpen={EAnalysisAsideMenuKey.analysisBasic}
    >
      <div>Analysis Basic Stock</div>
    </Layout>
  );
}

export default AnalysisBasicStockPage;
