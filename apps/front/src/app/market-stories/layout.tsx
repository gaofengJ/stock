'use client';

import React from 'react';

import CommonLayout from '@/components/Layout';
import { EHeaderMenuKey } from '@/components/Layout/enum';

import MarketStoriesPage from './page';

export default function Layout() {
  return (
    <CommonLayout
      headerMenuActive={EHeaderMenuKey.marketStories}
      showAsideMenu={false}
      contentClassName="p-0"
    >
      <MarketStoriesPage />
    </CommonLayout>
  );
}
