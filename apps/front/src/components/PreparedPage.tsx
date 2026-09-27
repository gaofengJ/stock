'use client';

import { Button, Result } from 'antd';
import Link from 'next/link';
import { useAccount } from '@/auth/Boundary';
import { allowedPath } from '@/auth/client';
import Layout from './Layout';

export default function PreparedPage({ title, menu }: { title: string; menu: string }) {
  const { user } = useAccount();
  return (
    <Layout showAsideMenu={false} headerMenuActive={menu}>
      <div className="prepared-page">
        <h1 className="page-heading">{title}</h1>
        <Result title="功能筹备中" subTitle="本栏目尚未上线，可先使用已开放的市场分析功能。" extra={allowedPath(user, '/analysis/overview') && <Link href="/analysis/overview"><Button type="primary">查看大盘概览</Button></Link>} />
      </div>
    </Layout>
  );
}
