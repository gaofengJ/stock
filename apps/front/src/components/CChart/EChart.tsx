'use client';

import { fontFamily } from '@/theme';
import {
  chartColors, chartPalette, quoteColors, uiColors, candlePanelColors,
} from '@/colors';
import { numberText } from '@/utils/format';
import { useEffect, useRef } from 'react';
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
  backgroundColor: candlePanelColors.background,
  textStyle: { color: candlePanelColors.text, fontFamily },
  legend: { textStyle: { color: candlePanelColors.text }, inactiveColor: candlePanelColors.axis },
  categoryAxis: darkAxis,
  valueAxis: darkAxis,
  tooltip: { backgroundColor: candlePanelColors.background, borderColor: candlePanelColors.axis, textStyle: { color: candlePanelColors.text } },
});

interface IEchartsProps {
  genOptions: () => EChartsOption;
  appearance?: 'light' | 'dark';
  height?: number;
}

const EChart = ({ genOptions, appearance = 'light', height = 360 }: IEchartsProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReactEChartsCore>(null);

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
        theme={appearance === 'dark' ? 'stock-dark' : 'stock'}
        option={{ ...options, textStyle: { fontFamily, fontSize: 12, ...options.textStyle }, tooltip: { confine: true, valueFormatter: (v: unknown) => numberText(v), ...tooltip } }}
        lazyUpdate
        style={{ width: '100%', height }}
        opts={{ renderer: 'canvas' }}
      />
    </div>
  );
};

export default EChart;
