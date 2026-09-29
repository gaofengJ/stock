/* eslint-disable react/no-danger -- Only trusted palette constants and a fixed pre-paint theme script are inserted. */
import AccountBoundary from '@/auth/Boundary';
import type { Metadata } from 'next';
import { themeVariablesCss } from '@/colors';
import SiteTheme from '@/components/SiteTheme';
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
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <style dangerouslySetInnerHTML={{ __html: themeVariablesCss }} />
        <script dangerouslySetInnerHTML={{ __html: '(function(){try{document.documentElement.dataset.theme=localStorage.getItem("stock-theme")==="dark"?"dark":"light"}catch(e){}})()' }} />
      </head>
      <body>
        <AntdRegistry><SiteTheme><AccountBoundary>{children}</AccountBoundary></SiteTheme></AntdRegistry>
      </body>
    </html>
  );
}
