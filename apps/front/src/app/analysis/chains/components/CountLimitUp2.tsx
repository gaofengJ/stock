import React, { useState, useEffect, useCallback } from 'react';

import dayjs from 'dayjs';
import { debounce } from 'lodash-es';
import { Spin } from 'antd';
import { getAnalysisChainsCountLimitUpTimes } from '@/api/services';
import { NSGetAnalysisChainsCountLimitUpTimes } from '@/api/services.types';

import CChart from '@/components/CChart';
import { EThemeColors } from '@/types/common.enum';
import { getRoundedMax } from '@/utils';

interface IProps {
  dateRange: string[]; // 起止时间
}

/**
 * 连板数
 */
const LIMIT_TIMES = 2;

const CountLimitUp2 = ({ dateRange }: IProps) => {
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
  const genOptions = () => ({
    grid: {
      top: '48',
      bottom: '0',
      left: '16',
      right: '16',
      containLabel: true, // grid 区域是否包含坐标轴的刻度标签(为true时left，right等属性决定包含坐标轴标签在内的矩形的位置)
    },
    title: {
      text: `${LIMIT_TIMES}连板数量`,
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
        rotate: 45, // 倾斜度 -90 至 90 默认为0
        margin: 20, // 标签距离刻度距离
      },
      data: sourceData.map((item) => dayjs(item.tradeDate).format('MM-DD')),
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: getRoundedMax(sourceData.map((item) => item.count)),
      interval: getRoundedMax(sourceData.map((item) => item.count)) / 5,
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
      top: 0,
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
  });
  return loading ? <Spin className="w-full h-320 !leading-[320px]" size="large" /> : <CChart genOptions={genOptions} />;
};

export default CountLimitUp2;
