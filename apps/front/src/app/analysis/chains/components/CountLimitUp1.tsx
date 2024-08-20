import React, { useState, useEffect, useCallback } from 'react';

import dayjs from 'dayjs';
import { debounce } from 'lodash-es';
import { Spin } from 'antd';
import { getAnalysisChainsCountLimitUpTimes } from '@/api/services';
import { NSGetAnalysisChainsCountLimitUpTimes } from '@/api/services.types';

import CChart from '@/components/CChart';
import { EThemeColors } from '@/types/common.enum';
import { getRoundedMax, getRoundedMin } from '@/utils';

interface IProps {
  dateRange: string[]; // 起止时间
}

/**
 * 连板数
 */
const LIMIT_TIMES = 1;

const CountLimitUp1 = ({ dateRange }: IProps) => {
  const [loading, setLoading] = useState<boolean>(false);
  const [sourceData, setSourceData] = useState<NSGetAnalysisChainsCountLimitUpTimes.IRes>([]);

  /**
   * 获取数据
   */
  const getChainsCount = useCallback(async () => {
    try {
      setLoading(true);
      const [startDate, endDate] = dateRange;
      const { data } = await getAnalysisChainsCountLimitUpTimes({
        startDate,
        endDate,
        limitTimes: LIMIT_TIMES,
      });
      setSourceData(data);
    } catch (e) {
      console.info(e);
    } finally {
      setLoading(false);
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

  /**
   * 生成 echarts options
   */
  const genOptions = () => {
    const min = getRoundedMin(sourceData.map((item) => item.count));
    const max = getRoundedMax(sourceData.map((item) => item.count));
    const interval = (max - min) / 5;
    return {
      grid: {
        top: '48',
        bottom: '16',
        left: '16',
        right: '16',
        containLabel: true, // grid 区域是否包含坐标轴的刻度标签(为true时left，right等属性决定包含坐标轴标签在内的矩形的位置)
      },
      title: {
        text: '首板数量',
        show: true,
        top: 0,
        left: 8,
        textStyle: {
          color: EThemeColors.colorPinkRed78,
          fontWeight: 'bold',
          fontSize: 20,
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
        data: sourceData.map((item) => dayjs(item.tradeDate).format('MM-DD')),
      },
      yAxis: {
        type: 'value',
        min,
        max,
        interval,
      },
      tooltip: {
        trigger: 'axis',
      },
      toolbox: {
        feature: {
          saveAsImage: {
            title: '保存为图片',
            iconStyle: {
              color: EThemeColors.colorTransparent,
              borderColor: EThemeColors.colorPinkRed78,
            },
            emphasis: { // hover样式
              iconStyle: {
                color: EThemeColors.colorTransparent,
                borderColor: EThemeColors.colorPinkRed78,
                textFill: EThemeColors.colorPinkRed78,
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
          itemStyle: {
            color: EThemeColors.colorPinkRed78,
          },
          label: {
            show: true,
            position: 'top',
            formatter: '{c}',
            color: EThemeColors.colorPinkRed78,
          },
          data: sourceData.map((item) => item.count),
        },
      ],
    };
  };
  return loading ? <Spin className="w-full h-320 !leading-[320px]" size="large" /> : <CChart genOptions={genOptions} />;
};

export default CountLimitUp1;
