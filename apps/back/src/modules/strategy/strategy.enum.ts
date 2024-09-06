/**
 * 策略类型
 */
export enum EStrategyType {
  /**
   * 向上跳空缺口后三连阳
   */
  gapThreeUp = 'gapThreeUp',
  /**
   * 向上跳空缺口后连续三日高换手率
   */
  gapThreeHighTurnover = 'gapThreeHighTurnover',
}
