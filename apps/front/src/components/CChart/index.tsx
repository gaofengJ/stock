'use client';

import dynamic from 'next/dynamic';
import Loading from '@/components/Loading';
import type { EChartsOption } from 'echarts-for-react/lib/types';

interface IEchartsProps {
  genOptions: () => EChartsOption;
  appearance?: 'light' | 'dark';
  height?: number;
  onLegendChange?: (selected: Record<string, boolean>) => void;
  onAxisHover?: (date: string | null) => void;
  formatHoverLegend?: (name: string, date: string | null) => string;
}

const EChart = dynamic(() => import('./EChart'), {
  ssr: false,
  loading: () => <Loading height={360} />,
});

const CChart = ({
  genOptions, appearance, height, onLegendChange, onAxisHover, formatHoverLegend,
}: IEchartsProps) => (
  <EChart genOptions={genOptions} appearance={appearance} height={height} onLegendChange={onLegendChange} onAxisHover={onAxisHover} formatHoverLegend={formatHoverLegend} />
);

export default CChart;
