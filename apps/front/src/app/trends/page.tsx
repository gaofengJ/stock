'use client';

import Layout from '@/components/Layout';
import { } from '@/components/Layout/config';
import { EHeaderMenuKey } from '@/components/Layout/enum';
// import styles from './index.module.less';

function TrendsPage() {
  return (
    <Layout
      showAsideMenu={false}
      headerMenuActive={EHeaderMenuKey.trends}
    >
      <div>Trends</div>
    </Layout>
  );
}

export default TrendsPage;
