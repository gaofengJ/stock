export interface NewsSource {
  code: string;
  name: string;
  path: string;
  kind: 'flash' | 'article';
  enabled: boolean;
  provider?: 'rsshub' | 'sina-flash';
  intervalSeconds?: number;
  importantPath?: string;
  availabilityNote?: string;
  description?: string;
}

export const NEWS_SOURCES: readonly NewsSource[] = [
  {
    code: 'jin10',
    name: '金十数据',
    description: '全球市场快讯，含重点消息。',
    path: '/jin10',
    kind: 'flash',
    enabled: true,
    importantPath: '/jin10/important',
  },
  {
    code: 'yicai',
    name: '第一财经',
    description: '国内财经与公司动态快讯。',
    path: '/yicai/brief',
    kind: 'flash',
    enabled: true,
  },
  {
    code: 'stcn',
    name: '证券时报',
    description: '证券市场与上市公司快讯。',
    path: '/stcn/article/list/kx',
    kind: 'flash',
    enabled: true,
  },
  {
    code: 'yicai-news',
    name: '第一财经头条',
    description: '第一财经头条报道。',
    path: '/yicai/headline',
    kind: 'article',
    enabled: true,
  },
  {
    code: 'sina',
    name: '新浪财经',
    description: '国内外财经滚动报道。',
    path: '/sina/finance/rollnews',
    kind: 'article',
    enabled: false,
    availabilityNote:
      '滚动新闻接口从当前服务器返回 HTTP 403；网站可访问不代表该接口可访问。',
  },
  {
    code: 'bloomberg',
    name: '彭博市场',
    description: '全球市场与财经报道（英文）。',
    path: '/bloomberg/markets',
    kind: 'article',
    enabled: false,
    availabilityNote:
      '当前服务器 DNS 解析异常，校正地址后 TLS 连接仍中断；需要可访问彭博的采集网络。',
  },
  {
    code: 'cls',
    name: '财联社电报',
    description: 'A股与市场实时电报，含重点消息。',
    path: '/cls/telegraph',
    kind: 'flash',
    enabled: true,
    importantPath: '/cls/telegraph/red',
  },
  {
    code: 'cls-news',
    name: '财联社头条',
    description: '财经热点与深度报道。',
    path: '/cls/depth/1000',
    kind: 'article',
    enabled: true,
    intervalSeconds: 600,
  },
  {
    code: 'wallstreetcn',
    name: '华尔街见闻快讯',
    description: '全球市场快讯，含重点消息。',
    path: '/wallstreetcn/live',
    kind: 'flash',
    enabled: true,
    importantPath: '/wallstreetcn/live/global/2',
  },
  {
    code: 'wscn-news',
    name: '华尔街见闻资讯',
    description: '宏观、市场与公司报道。',
    path: '/wallstreetcn/news',
    kind: 'article',
    enabled: true,
    intervalSeconds: 600,
  },
  {
    code: 'ths',
    name: '同花顺快讯',
    description: '7×24财经与股市快讯。',
    path: '/10jqka/realtimenews',
    kind: 'flash',
    enabled: true,
    importantPath: '/10jqka/realtimenews/%E9%87%8D%E8%A6%81',
  },
  {
    code: 'em-search',
    name: '东方财富股市新闻',
    description: '含“股市”关键词的公开新闻。',
    path: '/eastmoney/search/%E8%82%A1%E5%B8%82',
    kind: 'article',
    enabled: true,
    intervalSeconds: 600,
    availabilityNote:
      '按“股市”关键词聚合公开新闻，覆盖范围受东方财富搜索结果限制。',
  },
  {
    code: 'em-strategy',
    name: '东方财富策略研报',
    description: '券商市场策略研报。',
    path: '/eastmoney/report/strategyreport',
    kind: 'article',
    enabled: true,
    intervalSeconds: 1800,
  },
  {
    code: 'em-macro',
    name: '东方财富宏观研报',
    description: '宏观经济与政策研报。',
    path: '/eastmoney/report/macresearch',
    kind: 'article',
    enabled: true,
    intervalSeconds: 1800,
  },
  {
    code: 'em-broker',
    name: '东方财富券商晨报',
    description: '券商晨间市场摘要。',
    path: '/eastmoney/report/brokerreport',
    kind: 'article',
    enabled: true,
    intervalSeconds: 1800,
  },
  {
    code: 'em-industry',
    name: '东方财富行业研报',
    description: '行业趋势与研究报告。',
    path: '/eastmoney/report/industry',
    kind: 'article',
    enabled: true,
    intervalSeconds: 1800,
  },
  {
    code: 'em-stock',
    name: '东方财富个股研报',
    description: '个股研究与公司分析。',
    path: '/eastmoney/report/stock',
    kind: 'article',
    enabled: true,
    intervalSeconds: 1800,
  },
  {
    code: 'xueqiu-today',
    name: '雪球热门话题',
    description: '投资者热门讨论与观点。',
    path: '/xueqiu/today',
    kind: 'article',
    enabled: true,
    intervalSeconds: 600,
    availabilityNote:
      '采用可用的今日话题接口采集热门讨论；内容为用户观点，旧热帖接口目前返回 HTTP 400。',
  },
  {
    code: 'sina-flash',
    name: '新浪财经快讯',
    description: '新浪7×24财经快讯。',
    path: 'https://app.cj.sina.com.cn/api/news/pc',
    provider: 'sina-flash',
    kind: 'flash',
    enabled: true,
    availabilityNote:
      '使用新浪财经网页公开的快讯接口；与暂不可用的滚动报道接口分开采集。',
  },
];
export const sourceByCode = (code: string) =>
  NEWS_SOURCES.find((s) => s.code === code);
