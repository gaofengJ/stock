'use client';

import { fontFamily } from '@/theme';
import { useSiteTheme } from '@/components/SiteTheme';
import {
  chartColors, chartPalette, quoteColors, uiColors, darkUiColors, candlePanelColors,
} from '@/colors';
import { numberText } from '@/utils/format';
import { useEffect, useMemo, useRef } from 'react';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { LineChart, BarChart, CandlestickChart } from 'echarts/charts';
import {
  GridComponent,
  DataZoomComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  TitleComponent,
  ToolboxComponent,
  TooltipComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsOption } from 'echarts-for-react/lib/types';

echarts.use([
  LineChart,
  BarChart,
  CandlestickChart,
  GridComponent,
  DataZoomComponent,
  ToolboxComponent,
  TooltipComponent,
  TitleComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  CanvasRenderer,
]);

const axisTheme = {
  axisLine: { lineStyle: { color: chartColors.axis } },
  axisTick: { lineStyle: { color: chartColors.axis } },
  axisLabel: { color: uiColors.secondary },
  nameTextStyle: { color: uiColors.secondary },
  splitLine: { lineStyle: { color: chartColors.grid } },
};
echarts.registerTheme('stock', {
  backgroundColor: 'transparent',
  color: chartPalette,
  textStyle: { color: uiColors.text, fontFamily },
  title: { textStyle: { color: uiColors.text }, subtextStyle: { color: uiColors.secondary } },
  legend: { textStyle: { color: uiColors.secondary }, inactiveColor: uiColors.disabled },
  categoryAxis: axisTheme,
  valueAxis: axisTheme,
  timeAxis: axisTheme,
  candlestick: {
    itemStyle: {
      color: quoteColors.up, color0: quoteColors.down, borderColor: quoteColors.up, borderColor0: quoteColors.down,
    },
  },
});

const darkAxis = {
  axisLine: { lineStyle: { color: candlePanelColors.axis } },
  axisTick: { lineStyle: { color: candlePanelColors.axis } },
  axisLabel: { color: candlePanelColors.text },
  nameTextStyle: { color: candlePanelColors.text },
  splitLine: { lineStyle: { color: candlePanelColors.grid } },
};
echarts.registerTheme('stock-dark', {
  color: chartPalette,
  title: { textStyle: { color: candlePanelColors.text }, subtextStyle: { color: candlePanelColors.muted } },
  backgroundColor: 'transparent',
  textStyle: { color: candlePanelColors.text, fontFamily },
  legend: { textStyle: { color: candlePanelColors.text }, inactiveColor: candlePanelColors.axis },
  categoryAxis: darkAxis,
  valueAxis: darkAxis,
  timeAxis: darkAxis,
  tooltip: { backgroundColor: darkUiColors.surfaceMuted, borderColor: darkUiColors.border, textStyle: { color: darkUiColors.text } },
});

interface IEchartsProps {
  genOptions: () => EChartsOption;
  appearance?: 'light' | 'dark';
  height?: number;
  group?: string;
}

const chartGroups = new Map<string, number>();

const EChart = ({
  genOptions, appearance, height = 360, group,
}: IEchartsProps) => {
  const { mode } = useSiteTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReactEChartsCore>(null);
  const zoomRef = useRef<{ start: number; end: number }[]>([]);
  const events = useMemo(() => ({
    datazoom: (_event: unknown, instance: echarts.ECharts) => {
      const zoom = instance.getOption().dataZoom as { start: number; end: number }[];
      zoomRef.current = zoom.map(({ start, end }) => ({ start, end }));
    },
  }), []);

  useEffect(() => {
    const instance = chartRef.current?.getEchartsInstance();
    if (!group || !instance) return undefined;
    instance.group = group;
    chartGroups.set(group, (chartGroups.get(group) || 0) + 1);
    echarts.connect(group);
    return () => {
      instance.group = '';
      const remaining = (chartGroups.get(group) || 1) - 1;
      if (remaining) chartGroups.set(group, remaining);
      else {
        chartGroups.delete(group);
        echarts.disconnect(group);
      }
    };
  }, [group, mode, appearance]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const resizeObserver = new ResizeObserver(() => {
      chartRef.current?.getEchartsInstance().resize();
    });
    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  const options = genOptions();
  const tooltip = options.tooltip && !Array.isArray(options.tooltip) ? options.tooltip : {};
  return (
    <div ref={containerRef} className="w-full" style={{ height }}>
      <ReactEChartsCore
        ref={chartRef}
        echarts={echarts}
        theme={(appearance || mode) === 'dark' ? 'stock-dark' : 'stock'}
        onEvents={events}
        onChartReady={(instance: echarts.ECharts) => {
          zoomRef.current.forEach((zoom, dataZoomIndex) => instance.dispatchAction({ type: 'dataZoom', dataZoomIndex, ...zoom }));
        }}
        option={{ ...options, textStyle: { fontFamily, fontSize: 12, ...options.textStyle }, tooltip: { confine: true, valueFormatter: (v: unknown) => numberText(v), ...tooltip } }}
        lazyUpdate
        style={{ width: '100%', height }}
        opts={{ renderer: 'canvas' }}
      />
    </div>
  );
};

export default EChart;
