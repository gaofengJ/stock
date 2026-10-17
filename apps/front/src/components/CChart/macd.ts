/** MACD(12,26,9), seeded by the first valid close; Chinese histogram uses 2 × (DIF − DEA). */
export function calculateMacd(closes: (number | null | undefined)[]) {
  let fast: number | undefined;
  let slow: number | undefined;
  let signal = 0;
  const dif: (number | null)[] = [];
  const dea: (number | null)[] = [];
  const histogram: (number | null)[] = [];
  closes.forEach((close) => {
    if (close == null || !Number.isFinite(close)) {
      dif.push(null); dea.push(null); histogram.push(null);
      return;
    }
    fast = fast == null ? close : fast + (2 / 13) * (close - fast);
    slow = slow == null ? close : slow + (2 / 27) * (close - slow);
    const difference = fast - slow;
    signal += (2 / 10) * (difference - signal);
    dif.push(difference);
    dea.push(signal);
    histogram.push(2 * (difference - signal));
  });
  return { dif, dea, histogram };
}

export const macdHint = 'MACD(12,26,9)：DIF为收盘价EMA12减EMA26，DEA为DIF的EMA9，柱值为2×(DIF−DEA)。按当前周期与价格口径计算，从已加载首根有效收盘价初始化EMA；早期数值受历史长度影响，缺失价格不补零。缩放不改变计算起点；向前加载更多历史时会更新计算。';
