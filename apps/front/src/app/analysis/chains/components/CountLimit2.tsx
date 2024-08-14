import React, { useState, useEffect, useCallback } from 'react';

import dayjs from 'dayjs';
import { debounce } from 'lodash-es';
import { getAnalysisChainsCountLimitUpTimes } from '@/api/services';
import { NSGetAnalysisChainsCountLimitUpTimes } from '@/api/services.types';

import CChart from '@/components/CChart';

interface IProps {
  dateRange: string[];
}

/**
 * 连板数
 */
const LIMIT_TIMES = 2;

const CountLimit2 = ({
  dateRange,
}: IProps) => {
  const [sourceData, setSourceData] = useState<NSGetAnalysisChainsCountLimitUpTimes.IRes>([]);

  const getChainsCount = useCallback(async () => {
    try {
      const [startDate, endDate] = dateRange;
      const { data } = await getAnalysisChainsCountLimitUpTimes({
        startDate,
        endDate,
        limitTimes: LIMIT_TIMES,
      });
      setSourceData(data);
    } catch (e) {
      console.info(e);
    }
  }, [dateRange]);

  useEffect(() => {
    const debounceGetChainsCount = debounce(getChainsCount, 300);
    debounceGetChainsCount();

    // 清理函数以防止在组件卸载时继续调用
    return () => {
      debounceGetChainsCount.cancel();
    };
  }, [getChainsCount]);

  const getOptions = () => ({
    grid: {
      top: '80',
      left: '24',
      right: '24',
      bottom: '0',
      containLabel: true, // grid 区域是否包含坐标轴的刻度标签(为true时left，right等属性决定包含坐标轴标签在内的矩形的位置)
    },
    title: {
      text: `${LIMIT_TIMES}连板数量`,
      show: true,
      top: 8,
      left: 8,
    },
    xAxis: {
      type: 'category', // 类目轴
      axisLabel: {
        // x轴坐标样式
        interval: 0,
        rotate: 45, // 倾斜度 -90 至 90 默认为0
      },
      data: sourceData.map((item: Record<string, any>) => dayjs(item.tradeDate).format('MM-DD')),
    },
    yAxis: {
      type: 'value',
      interval: 200,
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'shadow',
      },
      padding: 8,
      borderWidth: 0,
    },
    toolbox: {
      feature: {
        saveAsImage: {
          title: '保存为图片',
        },
      },
      top: 8,
      right: 8,
    },
    series: [
      {
        type: 'line',
        itemStyle: {
        },
        data: sourceData.map((item: Record<string, any>) => item.count),
      },
    ],
  });
  return <CChart getOptions={getOptions} />;
};

export default CountLimit2;
