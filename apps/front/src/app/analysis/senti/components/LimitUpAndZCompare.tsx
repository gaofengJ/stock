import { numberText } from '@/utils/format';
import React, { useState, useEffect, useCallback } from 'react';

import dayjs from 'dayjs';
import { Spin } from 'antd';
import { getAnalysisSentiList } from '@/api/services';
import { NSGetAnalysisSentiList } from '@/api/services.types';

import CChart from '@/components/CChart';
import { quoteColors, uiColors } from '@/colors';
import { getRoundedMax, getRoundedMin } from '@/utils';
import { useLatestRequest } from '@/hooks/useLatestRequest';

interface IProps {
  dateRange: string[]; // 起止时间
}

const LimitUpAndZCompare = ({ dateRange }: IProps) => {
  const [loading, setLoading] = useState<boolean>(false);
  const [sourceData, setSourceData] = useState<NSGetAnalysisSentiList.IRes>([]);
  const { requestConfig, runLatestRequest } = useLatestRequest('senti-limit-up-z-compare');

  /**
   * 获取数据
   */
  const getSentiList = useCallback(() => runLatestRequest({
    request: () => {
      const [startDate, endDate] = dateRange;
      return getAnalysisSentiList({
        startDate,
        endDate,
      }, requestConfig);
    },
    onStart: () => {
      setLoading(true);
      setSourceData([]);
    },
    onSuccess: ({ data }) => setSourceData(data),
    onError: (error) => console.info(error),
    onFinally: () => setLoading(false),
  }), [dateRange, requestConfig, runLatestRequest]);

  useEffect(() => {
    getSentiList();
  }, [getSentiList]);

  /**
   * 生成 echarts options
   */
  const genOptions = () => {
    const minSentiA = getRoundedMin(sourceData.map((item) => +item.sentiA));
    const maxSentiA = getRoundedMax(sourceData.map((item) => +item.sentiA));
    const minSentiD = getRoundedMin(sourceData.map((item) => +item.sentiD));
    const maxSentiD = getRoundedMax(sourceData.map((item) => +item.sentiD));
    const intervalSentiA = (maxSentiA - minSentiA) / 5;
    const intervalSentiD = (maxSentiD - minSentiD) / 5;
    return {
      grid: {
        top: '48',
        bottom: '16',
        left: '16',
        right: '16',
        containLabel: true, // grid 区域是否包含坐标轴的刻度标签(为true时left，right等属性决定包含坐标轴标签在内的矩形的位置)
      },
      title: {
        text: '接力情绪',
        show: true,
        top: 0,
        left: 8,
        textStyle: {
          color: uiColors.secondary,
          fontWeight: 'bold',
          fontSize: 16,
        },
      },
      xAxis: {
        type: 'category', // 类目轴
        boundaryGap: false, // 确保坐标轴起始位置对齐到刻度线
        axisLabel: {
          // x轴坐标样式
          interval: 0,
          align: 'center', // 标签对齐方式
          rotate: 30, // 倾斜度 -90 至 90 默认为0
          margin: 20, // 标签距离刻度距离
        },
        data: sourceData.map((item) => dayjs(item.tradeDate).format('YYYY-MM-DD')),
      },
      yAxis: [
        {
          type: 'value',
          min: minSentiA,
          max: maxSentiA,
          interval: intervalSentiA,
        },
        {
          type: 'value',
          min: minSentiD,
          max: maxSentiD,
          interval: intervalSentiD,
          axisLabel: {
            formatter: '{value}%',
          },
        },
      ],
      tooltip: {
        trigger: 'axis',
        valueFormatter: (val: unknown) => numberText(val),
      },
      toolbox: {
        feature: {
          saveAsImage: {
            title: '保存为图片',
            iconStyle: {
              color: 'transparent',
              borderColor: uiColors.secondary,
            },
            emphasis: { // hover样式
              iconStyle: {
                color: 'transparent',
                borderColor: uiColors.secondary,
                textFill: uiColors.secondary,
              },
            },
          },
        },
        top: 2,
        right: 8,
      },
      series: [
        {
          type: 'line',
          tooltip: { valueFormatter: (val: unknown) => `${numberText(val, 0)}只` },
          yAxisIndex: 0, // 这个系列使用第一个y轴
          itemStyle: {
            color: quoteColors.up,
          },
          label: {
            show: true,
            position: 'top',
            formatter: (p: { value: unknown }) => numberText(p.value, 0),
            color: quoteColors.up,
          },
          data: sourceData.map((item) => +item.sentiA),
        },
        {
          type: 'line',
          tooltip: { valueFormatter: (val: unknown) => `${numberText(val)}%` },
          yAxisIndex: 1, // 这个系列使用第二个y轴
          itemStyle: {
            color: quoteColors.warning,
          },
          label: {
            show: true,
            position: 'top',
            formatter: (p: { value: unknown }) => `${numberText(p.value)}%`,
            color: quoteColors.warning,
          },
          data: sourceData.map((item) => item.sentiD),
        },
      ],
    };
  };
  return loading ? <Spin className="w-full h-320 !leading-[320px]" size="large" /> : <CChart genOptions={genOptions} />;
};

export default LimitUpAndZCompare;
