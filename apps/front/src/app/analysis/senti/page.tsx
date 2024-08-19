'use client';

import Layout from '@/components/Layout';
import { analysisSiderMenuItems } from '@/components/Layout/config';
import {
  EAnalysisAsideMenuKey,
  EHeaderMenuKey,
} from '@/components/Layout/enum';

import SingleDateSection from './components/SingleDateSection';
import DateRangeSection from './components/DateRangeSection';

function AnalysisSentiPage() {
  return (
    <Layout
      asideMenuItems={analysisSiderMenuItems}
      headerMenuActive={EHeaderMenuKey.analysis}
      asideMenuActive={EAnalysisAsideMenuKey.analysisChains}
    >
      <div className="p-16 rounded-[6px] bg-bg-white">
        <SingleDateSection />
        <DateRangeSection />
      </div>
    </Layout>
  );
}

export default AnalysisSentiPage;
