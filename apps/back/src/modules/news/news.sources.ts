export const NEWS_SOURCES = [
  {
    code: 'jin10',
    name: '金十数据',
    path: '/jin10',
    kind: 'flash',
    enabled: true,
  },
  {
    code: 'yicai',
    name: '第一财经',
    path: '/yicai/brief',
    kind: 'flash',
    enabled: true,
  },
  {
    code: 'stcn',
    name: '证券时报',
    path: '/stcn/article/list/kx',
    kind: 'flash',
    enabled: true,
  },
  {
    code: 'sina',
    name: '新浪财经',
    path: '/sina/finance/rollnews',
    kind: 'article',
    enabled: true,
  },
  {
    code: 'bloomberg',
    name: '彭博市场',
    path: '/bloomberg/markets',
    kind: 'article',
    enabled: false,
  },
] as const;
export type NewsSource = (typeof NEWS_SOURCES)[number];
export const sourceByCode = (code: string) =>
  NEWS_SOURCES.find((s) => s.code === code);
