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
 * analysis 侧边栏菜单 Key
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
  /**
   * 基础信息
   */
  analysisBasic = '/analysis/basic',
  /**
   * 基础信息-个股基础信息
   */
  analysisBasicStock = '/analysis/basic/stock',
  /**
   * 基础信息-每日交易数据
   */
  analysisBasicDaily = '/analysis/basic/daily'
}
