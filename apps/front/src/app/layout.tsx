import AccountBoundary from '@/auth/Boundary';
import type { Metadata } from 'next';
import { AntdRegistry } from '@ant-design/nextjs-registry';
import { Watermark } from 'antd';
import './global.css';
import '@/auth/account.css';

export const metadata: Metadata = {
  title: '木风同学的投资小站',
  description: '木风同学的投资小站',
  icons: '/favicon.ico',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>
        <Watermark
          font={{ color: 'rgba(37, 42, 52, 0.035)', fontSize: 12 }}
          gap={[180, 160]}
          height={40}
          width={160}
          content="木风同学的投资小站"
        >
          <AntdRegistry><AccountBoundary>{children}</AccountBoundary></AntdRegistry>
        </Watermark>
      </body>
    </html>
  );
}
