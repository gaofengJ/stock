import Link from 'next/link';
import DiscoveryShell from '@/discovery/Shell';
import HomeRedirect from '@/discovery/HomeRedirect';
import StructuredData from '@/discovery/StructuredData';
import {
  guides, publicMetadata, siteDescription, siteName, siteUrl,
} from '@/discovery/site';

export const metadata = publicMetadata('A股策略选股与每日复盘工具', siteDescription, '/');
const features = [
  {
    title: '市场情绪与涨停复盘', text: '查看市场涨跌分布、量能、连板与龙虎榜，整理当天的市场背景。', href: '/analysis/overview/', label: '查看市场概览',
  },
  {
    title: '策略选股与候选比较', text: '按策略规则筛选股票，结合多策略交集和横向比较缩小研究范围。', href: '/strategy/', label: '进入策略选股',
  },
  {
    title: '历史信号表现', text: '查看标准参数下信号后续的涨跌、上涨比例与有效样本，了解不同观察周期。', href: '/strategy/?view=performance', label: '查看历史信号',
  },
  {
    title: '个股资料与机构调研', text: '集中查看个股财务、资金、股东与机构调研资料，核实候选股票的研究线索。', href: '/basic/stock/', label: '查找个股资料',
  },
  {
    title: '券商月度金股', text: '按月份、券商和名称查询推荐名单，通过股票链接继续查看个股档案。', href: '/basic/stock/broker-picks/', label: '查询月度金股',
  },
  {
    title: '每日复盘与计划', text: '整理0—3只观察股票，记录核验事项和下一交易日计划，导出复盘文件。', href: '/review/', label: '开始每日复盘',
  },
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
        <div>
          <p className="discovery-eyebrow">A股 · 盘后研究 · 每日复盘</p>
          <h1>
            从市场变化到观察计划，
            <br />
            把盘后研究整理在一起。
          </h1>
          <p className="discovery-intro">适合习惯盘后筛选与复盘的投资者。先看市场背景，再比较策略候选，用个股资料核实线索，记录下一交易日的观察条件。</p>
          <div className="discovery-actions">
            <Link className="discovery-action primary" href="/analysis/overview/">体验市场概览</Link>
            <Link className="discovery-action" href="/guides/">阅读使用指南</Link>
          </div>
          <p className="discovery-caption">公开指南无需登录。工具可体验5分钟，免费注册后继续浏览。</p>
        </div>
        <div className="discovery-workflow" aria-label="盘后研究流程">
          <div className="discovery-step">
            <strong>01 看市场</strong>
            <span>市场情绪、板块变化、涨停与龙虎榜</span>
          </div>
          <div className="discovery-step">
            <strong>02 筛选与核实</strong>
            <span>策略候选、横向比较、财务与资金资料</span>
          </div>
          <div className="discovery-step">
            <strong>03 记录观察计划</strong>
            <span>研究线索、待核验事项、放弃条件</span>
          </div>
        </div>
      </section>
      <section className="discovery-section">
        <h2>可以在这里完成哪些研究</h2>
        <div className="discovery-grid">
          {features.map((feature) => (
            <article className="discovery-card" key={feature.title}>
              <h3>{feature.title}</h3>
              <p>{feature.text}</p>
              <Link href={feature.href}>{feature.label}</Link>
            </article>
          ))}
        </div>
      </section>
      <section className="discovery-section">
        <h2>从一个具体问题开始</h2>
        <div className="discovery-grid guides">
          {guides.map((guide) => (
            <article className="discovery-card" key={guide.slug}>
              <h3>{guide.title}</h3>
              <p>{guide.description}</p>
              <Link href={`/guides/${guide.slug}/`}>阅读操作步骤</Link>
            </article>
          ))}
        </div>
      </section>
      <section className="discovery-section">
        <h2>使用前常见问题</h2>
        <div className="discovery-faq">
          <details>
            <summary>需要注册才能查看吗？</summary>
            <p>首页和使用指南公开阅读，不计入体验时间。进入工具后可体验5分钟；登录或免费注册后，可以继续浏览获授权的功能。</p>
          </details>
          <details>
            <summary>策略命中和历史上涨比例代表什么？</summary>
            <p>命中表示满足筛选条件，适合继续研究。历史上涨比例是有效信号后续收盘上涨的占比，不含交易成本，不能直接当作实际交易胜率。</p>
          </details>
          <details>
            <summary>复盘记录保存在哪里？</summary>
            <p>草稿按账号和交易日期保存在当前浏览器，可导出Markdown文件。换浏览器或设备时，请保留导出文件。</p>
          </details>
          <details>
            <summary>数据什么时候更新？</summary>
            <p>不同资料的更新频率不同，工具页面会展示观察日期、获取时间或数据状态。资料暂未取得与所选范围没有记录，会分别提示。</p>
          </details>
        </div>
      </section>
    </DiscoveryShell>
  );
}
