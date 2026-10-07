'use client';

import CommonLayout from '@/components/Layout';

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <CommonLayout headerMenuActive="/trading-system" showAsideMenu={false}>
      <main className="account-page account-surface trading-system-page">{children}</main>
    </CommonLayout>
  );
}
