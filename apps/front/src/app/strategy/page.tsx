'use client';

import Layout from '@/components/Layout';
import { } from '@/components/Layout/config';
import { EHeaderMenuKey } from '@/components/Layout/enum';

function StrategyPage() {
  return (
    <Layout
      showAsideMenu={false}
      headerMenuActive={EHeaderMenuKey.strategy}
    >
      <div>Strategy</div>
    </Layout>
  );
}

export default StrategyPage;
