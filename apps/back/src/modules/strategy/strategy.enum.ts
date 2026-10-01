/**
 * 策略类型
 */
export enum EStrategyType {
  /**
   * 向上跳空缺口后三连阳
   */
  gapThreeUp = 'gapThreeUp',
  /**
   * 向上跳空缺口后二连阳
   */
  gapTwoUp = 'gapTwoUp',
  /**
   * 向上跳空缺口后连续三日高换手率
   */
  gapThreeHighTurnover = 'gapThreeHighTurnover',
  /**
   * 连续三日收阳
   */
  threeDaysHighVol = 'threeDaysHighVol',
  /**
   * 连续两次向上缺口
   */
  continuousGap = 'continuousGap',
  /**
   * 向上跳空上影反包
   */
  shadowWrap = 'shadowWrap',
}
