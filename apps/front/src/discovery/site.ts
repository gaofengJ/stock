import type { Metadata } from 'next';

export const siteUrl = 'https://stock.mufengtongxue.com';
export const siteName = '木风同学的投资小站';
export const siteDescription = '面向A股盘后研究的工具网站，集中查看市场情绪、龙虎榜、策略筛选、历史信号表现、券商月度金股与个股资料，整理每日复盘和下一交易日观察计划。';
export const guides = [
  {
    slug: 'daily-review', title: '如何整理每日复盘与下一交易日观察计划', description: '从市场背景、策略候选到观察名单，记录研究线索、核验事项和放弃条件，并导出复盘计划。', tool: '/review/', toolName: '每日复盘',
  },
  {
    slug: 'strategy-screening', title: '多策略选股与候选股票横向比较怎么用', description: '理解策略规则与自定义筛选，结合多策略交集、涨幅强度和行业表现缩小研究范围。', tool: '/strategy/', toolName: '策略选股',
  },
  {
    slug: 'signal-performance', title: '历史信号上涨比例与涨跌中位数怎么看', description: '了解标准参数、观察周期、有效信号数与数据缺失，理解历史信号表现的统计口径。', tool: '/strategy/?view=performance', toolName: '历史信号表现',
  },
  {
    slug: 'broker-monthly-picks', title: '券商月度金股名单怎么查询与继续研究', description: '按月份、券商和股票名称查找月度金股，通过个股档案继续查看财务、资金与机构调研资料。', tool: '/basic/stock/broker-picks/', toolName: '券商月度金股',
  },
] as const;

// Exact inventory: a marketing route must never make a business route public.
export const publicPaths = ['/', '/guides', ...guides.map((guide) => `/guides/${guide.slug}`)];
export function isDiscoveryPath(path: string) {
  return publicPaths.includes(path.replace(/\/$/, '') || '/');
}
export function publicMetadata(title: string, description: string, path: string): Metadata {
  const url = `${siteUrl}${path}`;
  return {
    title: { absolute: `${title}｜${siteName}` },
    description,
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    openGraph: {
      title, description, url, siteName, locale: 'zh_CN', type: 'website',
    },
    twitter: { card: 'summary', title, description },
  };
}
