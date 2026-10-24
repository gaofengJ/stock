import type { Metadata } from 'next';

export const siteUrl = 'https://stock.mufengtongxue.com';
export const siteName = '木风同学的投资小站';
export const siteDescription = '面向A股盘后研究的工具网站，集中查看市场情绪、龙虎榜、策略筛选、历史信号表现、券商月度金股与个股资料，整理每日复盘和下一交易日观察计划。';
export const guides = [
  {
    slug: 'daily-review', title: '每日复盘：整理下一交易日计划', description: '选日期、整理观察名单、写清条件，保存复盘记录。', tool: '/review/', toolName: '每日复盘',
  },
  {
    slug: 'strategy-screening', title: '策略选股：筛选与比较候选', description: '从策略规则入手，用自定义筛选和横向比较缩小范围。', tool: '/strategy/', toolName: '策略选股',
  },
  {
    slug: 'signal-performance', title: '历史信号：读懂比例与中位数', description: '确认参数、观察周期和有效样本，再看信号表现。', tool: '/strategy/?view=performance', toolName: '历史信号表现',
  },
  {
    slug: 'broker-monthly-picks', title: '券商金股：查找每月推荐名单', description: '按月份、券商或股票查询，再通过个股档案继续研究。', tool: '/basic/stock/broker-picks/', toolName: '券商月度金股',
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
