'use client';

import dynamic from 'next/dynamic';
import Loading from '@/components/Loading';
import type { EChartsOption } from 'echarts-for-react/lib/types';

interface IEchartsProps {
  genOptions: () => EChartsOption;
  appearance?: 'light' | 'dark';
  height?: number;
  onLegendChange?: (selected: Record<string, boolean>) => void;
}

const EChart = dynamic(() => import('./EChart'), {
  ssr: false,
  loading: () => <Loading height={360} />,
});

const CChart = ({
  genOptions, appearance, height, onLegendChange,
}: IEchartsProps) => (
  <EChart genOptions={genOptions} appearance={appearance} height={height} onLegendChange={onLegendChange} />
);

export default CChart;
