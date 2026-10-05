/** Fixed date sampling keeps equal windows comparable regardless of chart width. */
export function overviewDateAxis(dates: string[]) {
  const step = Math.max(1, Math.ceil((dates.length - 1) / 4));
  return {
    type: 'category' as const,
    data: dates,
    boundaryGap: true,
    axisPointer: { snap: true },
    axisTick: { alignWithLabel: true },
    axisLabel: {
      interval: (index: number) => index === 0 || index === dates.length - 1 || (index % step === 0 && index < dates.length - 1 - step / 2),
      showMinLabel: true,
      showMaxLabel: true,
      hideOverlap: true,
      formatter: (date: string) => date.slice(5),
    },
  };
}

export const overviewGrid = {
  left: 64, right: 32, top: 56, bottom: 32,
};
