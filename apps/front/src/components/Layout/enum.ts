/**
 * 顶部菜单 Key
 */
export enum EHeaderMenuKey {
  /**
   * 数据分析
   */
  analysis = '/analysis',
  /**
   * 市场行情
   */
  trends = '/trends',
  /**
   * 基础数据
   */
  basic = '/basic',
  /**
   * 实时资讯
   */
  news = '/news',
  /**
   * 复盘笔记
   */
  review = '/review',
  /**
   * 后台管理
   */
  admin = '/admin'
}

/**
 * 头像下拉菜单 Key
 */
export enum EAvatarDropdownKey {
  /**
   * 个人中心
   */
  PERSONAL_CENTER = 'PERSONAL_CENTER',
  /**
   * 切换账号
   */
  SWITCH_ACCOUNT = 'SWITCH_ACCOUNT',
}

/**
 * 数据分析 侧边栏菜单 Key
 */
export enum EAnalysisAsideMenuKey {
  /**
   * 情绪指标
   */
  analysisSenti = '/analysis/senti',
  /**
   * 连板统计
   */
  analysisChains = '/analysis/chains',
  /**
   * 涨停板复盘
   */
  analysisLimits = '/analysis/limits',
}

/**
 * 基础数据 侧边栏菜单 Key
 */
export enum EBasicAsideMenuKey {
  /**
   * 基础数据-个股基础信息
   */
  basicStock = '/basic/stock',
  /**
   * 基础数据-每日交易数据
   */
  basicDaily = '/basic/daily',
}
