/**
 * 市场类型
 */
export enum EMarket {
  主板 = '主板',
  创业板 = '创业板',
  科创板 = '科创板',
  CDR = 'CDR',
}

/**
 * 上市状态
 */
export enum EListStatus {
  /**
   * 上市
   */
  L = 'L',
  /**
   * 退市
   */
  D = 'D',
  /**
   * 暂停上市
   */
  P = 'P',
}

/**
 * 是否沪深港通标的
 */
export enum EIsHs {
  /**
   * 否
   */
  N = 'N',
  /**
   * 沪股通
   */
  H = 'H',
  /**
   * 深股通
   */
  S = 'S',
}
