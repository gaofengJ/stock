'use client';

import Layout from '@/components/Layout';
import { EHeaderMenuKey } from '@/components/Layout/enum';
// import styles from './index.module.less';

function NewsPage() {
  return (
    <Layout
      showAsideMenu={false}
      headerMenuActive={EHeaderMenuKey.news}
    >
      <div>News</div>
    </Layout>
  );
}

export default NewsPage;
