import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { AntdRegistry } from '@ant-design/nextjs-registry';
import { Watermark } from 'antd';
import './global.css';

const inter = Inter({ subsets: ['latin'] }); // 仅加载 Inter 字体的拉丁字母子集。这有助于减少字体文件的大小，从而提高页面加载速度

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
    <html lang="en">
      <body className={inter.className}>
        <Watermark
          height={40}
          width={160}
          content="木风同学的投资小站"
        >
          <AntdRegistry>{children}</AntdRegistry>
        </Watermark>
      </body>
    </html>
  );
}
