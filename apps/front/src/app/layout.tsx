/* eslint-disable react/no-danger -- Only trusted palette constants and a fixed pre-paint theme script are inserted. */
import DiscoveryBoundary from '@/discovery/Boundary';
import { siteDescription, siteName, siteUrl } from '@/discovery/site';
import type { Metadata } from 'next';
import { themeVariablesCss } from '@/colors';
import SiteTheme from '@/components/SiteTheme';
import { AntdRegistry } from '@ant-design/nextjs-registry';
import './global.css';
import '@/components/Interaction/interaction.css';
import '@/auth/account.css';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: siteName, template: `%s｜${siteName}` },
  description: siteDescription,
  robots: { index: false, follow: false },
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
        <AntdRegistry><SiteTheme><DiscoveryBoundary>{children}</DiscoveryBoundary></SiteTheme></AntdRegistry>
      </body>
    </html>
  );
}
