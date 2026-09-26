/**
 * 策略类型
 */
export enum EStrategyType {
  /**
   * 向上跳空未回补后三连阳
   */
  gapThreeUp = 'gapThreeUp',
  /**
   * 向上跳空未回补后二连阳
   */
  gapTwoUp = 'gapTwoUp',
  /**
   * 向上跳空后三日高换手
   */
  gapThreeHighTurnover = 'gapThreeHighTurnover',
  /**
   * 连续三日放量不萎缩
   */
  threeDaysHighVol = 'threeDaysHighVol',
  /**
   * 连续两次向上缺口
   */
  continuousGap = 'continuousGap',
  /**
   * 向上跳空长上影反包
   */
  shadowWrap = 'shadowWrap',
}
