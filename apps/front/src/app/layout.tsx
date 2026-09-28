import AccountBoundary from '@/auth/Boundary';
import type { Metadata } from 'next';
import { AntdRegistry } from '@ant-design/nextjs-registry';
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
        <AntdRegistry><AccountBoundary>{children}</AccountBoundary></AntdRegistry>
      </body>
    </html>
  );
}
