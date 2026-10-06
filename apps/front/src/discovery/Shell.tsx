import type { ReactNode } from 'react';
import Link from 'next/link';
import { ThemeToggle } from '@/components/SiteTheme';
import ImgFengye from '@/assets/imgs/fengye.png';
import { siteName } from './site';
import './discovery.css';

export default function DiscoveryShell({ children }: { children: ReactNode }) {
  return (
    <div className="discovery">
      <a className="discovery-skip" href="#main-content">跳到正文</a>
      <header className="discovery-header">
        <div className="discovery-header-inner">
          <Link className="discovery-brand" href="/">
            <img src={ImgFengye.src} width="28" height="28" alt="" />
            {siteName}
          </Link>
          <nav aria-label="网站导航">
            <Link href="/guides/">使用指南</Link>
            <Link href="/login/">登录</Link>
            <ThemeToggle />
          </nav>
        </div>
      </header>
      <main id="main-content" className="discovery-main">{children}</main>
      <footer className="discovery-footer">
        <span>
          {siteName}
          {' '}
          · 行情、选股与复盘
        </span>
        <span>数据与历史统计用于辅助研究，请结合公告原文核实。</span>
      </footer>
    </div>
  );
}
