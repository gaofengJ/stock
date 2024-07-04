'use client';

import Layout from '@/components/Layout';
import { analysisSiderMenuItems } from '@/components/Layout/config';
import { EAnalysisAsideMenuKey, EHeaderMenuKey } from '@/components/Layout/enum';
// import styles from './index.module.less';

function NewsPage() {
  return (
    <Layout
      showAsideMenu={false}
      asideMenuItems={analysisSiderMenuItems}
      headerMenuActive={EHeaderMenuKey.analysis}
      asideMenuActive={EAnalysisAsideMenuKey.analysisSenti}
    >
      <div>News</div>
    </Layout>
  );
}

export default NewsPage;
