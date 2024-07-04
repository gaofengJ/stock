'use client';

import Layout from '@/components/Layout';
import { } from '@/components/Layout/config';
import { EHeaderMenuKey } from '@/components/Layout/enum';
// import styles from './index.module.less';

function ReviewPage() {
  return (
    <Layout
      showAsideMenu={false}
      headerMenuActive={EHeaderMenuKey.review}
    >
      <div>Review</div>
    </Layout>
  );
}

export default ReviewPage;
