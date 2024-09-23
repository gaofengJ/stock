'use client';

import Layout from '@/components/Layout';
import { analysisSiderMenuItems } from '@/components/Layout/config';
import {
  EAnalysisAsideMenuKey,
  EHeaderMenuKey,
} from '@/components/Layout/enum';

import DateRangeSection from './components/DateRangeSection';
import SingleDateSection from './components/SingleDateSection';

function AnalysisSentiPage() {
  return (
    <Layout
      asideMenuItems={analysisSiderMenuItems}
      headerMenuActive={EHeaderMenuKey.analysis}
      asideMenuActive={EAnalysisAsideMenuKey.analysisSenti}
    >
      <div className="p-16 rounded-[6px] bg-bg-white">
        <SingleDateSection />
        <DateRangeSection />
      </div>
    </Layout>
  );
}

export default AnalysisSentiPage;
