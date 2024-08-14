import React, { useState, useEffect, useCallback } from 'react';
import CChart from '@/components/CChart';
import { EThemeColors } from '@/types/common.enum';

interface IProps {
  date: string
}

const CountLimit2 = ({ date }: IProps) => {
  const [statisticslist, setStatisticslist] = useState<Record<string, any>[]>(
    [],
  );

  const getStatistics = useCallback(async () => {
    try {
      // const { list } = await ANALYSISAPI.getStatistics({
      //   date,
      // });
      console.log('date', date);
      const list: any[] = [];
      setStatisticslist(list);
    } catch (e) {
      console.info(e);
    }
  }, [date]);

  useEffect(() => {
    getStatistics();
  });

  const getOptions = () => ({
    grid: {
      top: '80',
      left: '24',
      right: '24',
      bottom: '0',
      containLabel: true, // grid 区域是否包含坐标轴的刻度标签(为true时left，right等属性决定包含坐标轴标签在内的矩形的位置)
    },
    title: {
      text: '个股涨跌统计',
      show: false,
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
      data: statisticslist.map((item: Record<string, any>) => item.key),
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
        type: 'bar',
        itemStyle: {
          normal: {
            color(params: Record<string, any>) {
              if (params.dataIndex > 10) {
                return EThemeColors.colorViolet;
              }
              if (params.dataIndex < 10) {
                return EThemeColors.colorOrange;
              }
              return EThemeColors.colorLightGreen;
            },
          },
        },
        data: statisticslist.map((item: Record<string, any>) => item.value),
      },
    ],
  });
  return <CChart getOptions={getOptions} />;
};

export default CountLimit2;
