import { SetMetadata } from '@nestjs/common';

export const ACCESS = 'stock:access';
export type AccessRule = {
  public?: boolean;
  login?: boolean;
  any?: string[];
  allowPasswordChange?: boolean;
};
export const Public = () => SetMetadata(ACCESS, { public: true });
export const SignedIn = (allowPasswordChange = false) =>
  SetMetadata(ACCESS, { login: true, allowPasswordChange });
export const Permit = (...any: string[]) => SetMetadata(ACCESS, { any });

export const PERMISSIONS = [
  {
    code: 'analysis:senti',
    name: '情绪指标',
    group: '数据分析',
    route: '/analysis/senti',
  },
  {
    code: 'analysis:chains',
    name: '连板统计',
    group: '数据分析',
    route: '/analysis/chains',
  },
  {
    code: 'analysis:limits',
    name: '涨停板复盘',
    group: '数据分析',
    route: '/analysis/limits',
  },
  {
    code: 'market:read',
    name: '市场行情',
    group: '市场行情',
    route: '/trends',
  },
  {
    code: 'strategy:read',
    name: '策略选股',
    group: '策略选股',
    route: '/strategy',
  },
  {
    code: 'basic:stock',
    name: '个股基本信息',
    group: '基础数据',
    route: '/basic/stock',
  },
  {
    code: 'basic:daily',
    name: '每日交易数据',
    group: '基础数据',
    route: '/basic/daily',
  },
  {
    code: 'basic:calendar',
    name: '交易日历',
    group: '基础数据',
    route: '/basic/trade-cal',
  },
  {
    code: 'basic:funds',
    name: '游资名录',
    group: '基础数据',
    route: '/basic/active-funds',
  },
  { code: 'news:read', name: '实时资讯', group: '实时资讯', route: '/news' },
  {
    code: 'review:read',
    name: '每日复盘',
    group: '每日复盘',
    route: '/review',
  },
  {
    code: 'blog:read',
    name: '市场那些事',
    group: '市场那些事',
    route: '/blog',
  },
  {
    code: 'users:manage',
    name: '人员管理',
    group: '管理后台',
    route: '/admin/users',
  },
  {
    code: 'roles:manage',
    name: '角色与权限管理',
    group: '管理后台',
    route: '/admin/roles',
  },
  {
    code: 'sync:read',
    name: '同步记录',
    group: '管理后台',
    route: '/admin/sync',
  },
  { code: 'sync:run', name: '执行数据同步', group: '管理后台', route: '' },
  {
    code: 'logs:read',
    name: '日志分析',
    group: '管理后台',
    route: '/admin/logs',
  },
  {
    code: 'data:write',
    name: '公共数据维护接口',
    group: '管理后台',
    route: '',
  },
];
export const DEFAULT_PERMISSIONS = PERMISSIONS.filter(
  (p) => p.group !== '管理后台',
).map((p) => p.code);
