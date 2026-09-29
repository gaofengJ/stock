'use client';

import { fontFamily } from '@/theme';
import {
  chartColors, chartPalette, quoteColors, uiColors,
} from '@/colors';
import { numberText } from '@/utils/format';
import { useEffect, useRef } from 'react';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { LineChart, BarChart, CandlestickChart } from 'echarts/charts';
import {
  GridComponent,
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

interface IEchartsProps {
  genOptions: () => EChartsOption;
}

const EChart = ({ genOptions }: IEchartsProps) => {
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
    <div ref={containerRef} className="w-full h-360">
      <ReactEChartsCore
        ref={chartRef}
        echarts={echarts}
        theme="stock"
        option={{ ...options, textStyle: { fontFamily, fontSize: 12, ...options.textStyle }, tooltip: { confine: true, valueFormatter: (v: unknown) => numberText(v), ...tooltip } }}
        lazyUpdate
        style={{ width: '100%', height: '360px' }}
        opts={{ renderer: 'canvas' }}
      />
    </div>
  );
};

export default EChart;
