import Link from 'next/link';
import DiscoveryShell from '@/discovery/Shell';
import HomeRedirect from '@/discovery/HomeRedirect';
import StructuredData from '@/discovery/StructuredData';
import {
  guides, publicMetadata, siteDescription, siteName, siteUrl,
} from '@/discovery/site';
import { guestTrialMinutes } from '@/auth/trial';
import ReviewIllustration from '@/discovery/ReviewIllustration';

export const metadata = publicMetadata('A股策略选股与每日复盘工具', siteDescription, '/');
const features = [
  {
    step: '01', title: '看市场', text: '查看指数、量能与涨跌分布，确定当天的市场背景。', href: '/analysis/overview/', label: '打开市场概览',
  },
  {
    step: '02', title: '筛选股票', text: '比较策略候选，结合K线和个股资料核实线索。', href: '/strategy/', label: '打开策略选股',
  },
  {
    step: '03', title: '写复盘', text: '整理观察名单，记录下一交易日的关注与放弃条件。', href: '/review/', label: '打开每日复盘',
  },
];
const resources = [
  { title: '历史信号表现', text: '查看有效样本与后续涨跌', href: '/strategy/?view=performance' },
  { title: '个股资料', text: '查询财务、资金与机构调研', href: '/basic/stock/' },
  { title: '券商月度金股', text: '按月份和券商查找推荐名单', href: '/basic/stock/broker-picks/' },
];
export default function Page() {
  return (
    <DiscoveryShell>
      <HomeRedirect />
      <StructuredData data={{
        '@context': 'https://schema.org', '@type': 'WebSite', name: siteName, url: siteUrl, description: siteDescription, inLanguage: 'zh-CN',
      }}
      />
      <section className="discovery-hero">
        <div className="discovery-hero-copy">
          <p className="discovery-eyebrow">A股盘后研究工具</p>
          <h1>看清市场，筛选股票，写好复盘。</h1>
          <p className="discovery-intro">从当天行情到下一交易日计划，把研究线索和观察条件整理在一起。</p>
          <div className="discovery-actions">
            <Link className="discovery-action primary" href="/analysis/overview/">开始免费体验</Link>
            <Link className="discovery-action" href="/register/">免费注册</Link>
          </div>
          <p className="discovery-caption">{`无需注册，进入工具后可体验 ${guestTrialMinutes} 分钟。首页和指南不计时。`}</p>
        </div>
        <ReviewIllustration />
      </section>
      <section className="discovery-section" aria-labelledby="research-heading">
        <h2 id="research-heading">盘后研究，从这三步开始</h2>
        <div className="discovery-grid">
          {features.map((feature) => (
            <article className="discovery-card" key={feature.title}>
              <span className="discovery-step-number" aria-hidden="true">{feature.step}</span>
              <h3>{feature.title}</h3>
              <p>{feature.text}</p>
              <Link href={feature.href}>{feature.label}</Link>
            </article>
          ))}
        </div>
        <nav className="discovery-resources" aria-label="更多研究工具">
          {resources.map((resource) => (
            <Link key={resource.href} href={resource.href}>
              <strong>{resource.title}</strong>
              <span>{resource.text}</span>
            </Link>
          ))}
        </nav>
      </section>
      <section className="discovery-section" aria-labelledby="guides-heading">
        <div className="discovery-section-heading">
          <h2 id="guides-heading">使用指南</h2>
          <Link href="/guides/">查看全部指南</Link>
        </div>
        <ul className="discovery-guide-links">
          {guides.map((guide) => <li key={guide.slug}><Link href={`/guides/${guide.slug}/`}>{guide.title}</Link></li>)}
        </ul>
      </section>
      <section className="discovery-section" aria-labelledby="faq-heading">
        <h2 id="faq-heading">常见问题</h2>
        <div className="discovery-faq">
          <details>
            <summary>体验结束后如何继续？</summary>
            <p>{`进入工具后可体验 ${guestTrialMinutes} 分钟，登录或免费注册后可继续使用获授权的功能。首页和指南始终公开。`}</p>
          </details>
          <details>
            <summary>策略命中和历史上涨比例代表什么？</summary>
            <p>命中表示满足筛选条件。上涨比例统计信号后的价格变化，不含交易成本，不等于实际交易胜率。</p>
          </details>
          <details>
            <summary>复盘记录如何保存？</summary>
            <p>点击“保存”后，记录按账号和交易日期存入服务器，可跨设备读取。未保存的编辑请先保存，也可导出备份。</p>
          </details>
          <details>
            <summary>数据什么时候更新？</summary>
            <p>各页面标明数据日期和更新状态；获取失败、资料缺失和没有记录会分别提示。</p>
          </details>
        </div>
      </section>
    </DiscoveryShell>
  );
}
