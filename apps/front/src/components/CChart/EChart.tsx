'use client';

import { useEffect, useRef } from 'react';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { LineChart, BarChart } from 'echarts/charts';
import {
  GridComponent,
  LegendComponent,
  TitleComponent,
  ToolboxComponent,
  TooltipComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsOption } from 'echarts-for-react/lib/types';

echarts.use([
  LineChart,
  BarChart,
  GridComponent,
  ToolboxComponent,
  TooltipComponent,
  TitleComponent,
  LegendComponent,
  CanvasRenderer,
]);

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

  return (
    <div ref={containerRef} className="w-full h-360">
      <ReactEChartsCore
        ref={chartRef}
        echarts={echarts}
        option={genOptions()}
        lazyUpdate
        style={{ width: '100%', height: '360px' }}
        opts={{ renderer: 'canvas' }}
      />
    </div>
  );
};

export default EChart;
