'use client';

import dynamic from 'next/dynamic';
import type { EChartsOption } from 'echarts-for-react/lib/types';

interface IEchartsProps {
  genOptions: () => EChartsOption;
}

const EChart = dynamic(() => import('./EChart'), {
  ssr: false,
  loading: () => <div className="w-full h-360" />,
});

const CChart = ({ genOptions }: IEchartsProps) => (
  <EChart genOptions={genOptions} />
);

export default CChart;
