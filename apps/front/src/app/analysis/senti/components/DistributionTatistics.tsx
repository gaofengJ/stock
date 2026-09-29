import Loading from '@/components/Loading';
import { numberText } from '@/utils/format';
import { useCallback, useEffect, useState } from 'react';
import { NSGetAnalysisSentiDistributionTatistics } from '@/api/services.types';
import { getAnalysisSentiDistributionTatistics } from '@/api/services';
import { quoteColors } from '@/colors';
import CChart from '@/components/CChart';
import { useSiteTheme } from '@/components/SiteTheme';
import { getRoundedMax, getRoundedMin } from '@/utils';
import { useLatestRequest } from '@/hooks/useLatestRequest';

interface IProps {
  tradeDate: string; // 交易时间
}

interface ITotalData {
  countPositive: number;
  countNegative: number;
  countZero: number;
}

const DistributionTatistics = ({ tradeDate }: IProps) => {
  const { colors } = useSiteTheme();
  const [loading, setLoading] = useState<boolean>(false);
  const [sourceData, setSourceData] = useState<NSGetAnalysisSentiDistributionTatistics.IRes>([]);
  const { requestConfig, runLatestRequest } = useLatestRequest('senti-distribution-statistics');

  const [totalData, setTotalData] = useState<ITotalData>({
    countPositive: 0,
    countNegative: 0,
    countZero: 0,
  });

  /**
   * 计算总数
   */
  const calcTotal = (data: NSGetAnalysisSentiDistributionTatistics.IRes) => {
    // 计算count大于0、等于0和小于0的数量
    let countPositive = 0;
    let countZero = 0;
    let countNegative = 0;
    for (let i = 0; i < data.length; i += 1) {
      if (i < 10) {
        countPositive += data[i].count;
      } else if (i > 10) {
        countNegative += data[i].count;
      } else {
        countZero += data[i].count;
      }
    }
    setTotalData({
      countPositive,
      countNegative,
      countZero,
    });
  };

  /**
   * 获取数据
   */
  const getDistributionTatistics = useCallback(() => runLatestRequest({
    request: () => getAnalysisSentiDistributionTatistics({
      date: tradeDate,
    }, requestConfig),
    onStart: () => {
      setLoading(true);
      setSourceData([]);
      setTotalData({
        countPositive: 0,
        countNegative: 0,
        countZero: 0,
      });
    },
    onSuccess: ({ data }) => {
      setSourceData(data);
      calcTotal(data);
    },
    onError: (error) => console.info(error),
    onFinally: () => setLoading(false),
  }), [requestConfig, runLatestRequest, tradeDate]);

  useEffect(() => {
    getDistributionTatistics();
  }, [getDistributionTatistics]);

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
        text: '涨跌分布统计',
        show: true,
        top: 0,
        left: 8,
        textStyle: {
          color: colors.secondary,
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
        data: sourceData.map((item) => item.tradeDate),
      },
      yAxis: {
        type: 'value',
        min,
        max,
        interval,
        axisLabel: {
          formatter: '{value}',
        },
      },
      tooltip: {
        trigger: 'axis',
        // valueFormatter: (val: string) => `${val}`,
      },
      toolbox: {
        feature: {
          saveAsImage: {
            title: '保存为图片',
            iconStyle: {
              color: 'transparent',
              borderColor: colors.secondary,
            },
            emphasis: {
              // hover样式
              iconStyle: {
                color: 'transparent',
                borderColor: colors.secondary,
                textFill: colors.secondary,
              },
            },
          },
        },
        top: 2,
        right: 8,
      },
      series: [
        {
          type: 'bar',
          itemStyle: {
            color(params: any) {
              const { dataIndex } = params; // 获取当前数据点的索引
              if (dataIndex > 10) {
                return quoteColors.up; // 红色
              }
              if (dataIndex < 10) {
                return quoteColors.down; // 绿色
              }
              return quoteColors.flat; // 灰色
            },
          },
          label: {
            show: true,
            position: 'top',
            formatter: (p: { value: unknown }) => numberText(p.value, 0),
            color: colors.secondary,
          },
          data: sourceData.map((item) => item.count),
        },
      ],
    };
  };

  return (
    <div className="relative">
      <div className="absolute flex items-center top-4 right-60">
        <span className="inline-block w-8 h-8 rounded-[4px] bg-quote-down" />
        <span className="ml-8 text-16 text-text-black78">{totalData.countPositive}</span>
        <span className="inline-block ml-16 w-8 h-8 rounded-[4px] bg-quote-flat" />
        <span className="ml-8 text-16 text-text-black78">{totalData.countZero}</span>
        <span className="inline-block ml-16 w-8 h-8 rounded-[4px] bg-quote-up" />
        <span className="ml-8 text-16 text-text-black78">{totalData.countNegative}</span>
      </div>
      {loading ? (
        <Loading />
      ) : (
        <CChart genOptions={genOptions} />
      )}
    </div>
  );
};

export default DistributionTatistics;
