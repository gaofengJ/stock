import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { AntdRegistry } from '@ant-design/nextjs-registry';
import './globals.css';

const inter = Inter({ subsets: ['latin'] }); // 仅加载 Inter 字体的拉丁字母子集。这有助于减少字体文件的大小，从而提高页面加载速度

export const metadata: Metadata = {
  title: 'Stock',
  description: '木风同学的投资小站',
  icons: '/favicon.ico',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <AntdRegistry>{children}</AntdRegistry>
      </body>
    </html>
  );
}
