import type { EChartsOption } from 'echarts';

/** Resolve only the cells belonging to the hovered category, including sparse rows. */
export function heatmapRowTargets(option: EChartsOption, axisIndex: number, name: string) {
  const axes = Array.isArray(option.yAxis) ? option.yAxis : [option.yAxis];
  const axis = axes[axisIndex];
  if (!axis || !('data' in axis)) return [];
  const rowIndex = axis.data?.findIndex((item) => (typeof item === 'object' ? item.value : item) === name) ?? -1;
  if (rowIndex < 0) return [];
  const series = Array.isArray(option.series) ? option.series : [option.series];
  return series.flatMap((item, seriesIndex) => {
    if (item?.type !== 'heatmap' || (item.yAxisIndex || 0) !== axisIndex) return [];
    const dataIndex = (item.data || []).flatMap((point, index) => {
      let value = point;
      if (point && !Array.isArray(point) && typeof point === 'object' && 'value' in point) value = point.value;
      return Array.isArray(value) && value[1] === rowIndex ? [index] : [];
    });
    return dataIndex.length ? [{ seriesIndex, dataIndex }] : [];
  });
}
