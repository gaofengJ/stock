import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';

// 引入所需的图表类型，带有 Chart 后缀
import {
  LineChart,
  BarChart,
  // PieChart,
  // ScatterChart,
  // RadarChart,
  // MapChart,
  // TreeChart,
  // TreemapChart,
  // GraphChart,
  // GaugeChart,
  // FunnelChart,
  // ParallelChart,
  // SankeyChart,
  // BoxplotChart,
  // CandlestickChart,
  // EffectScatterChart,
  // LinesChart,
  // HeatmapChart,
  // PictorialBarChart,
  // ThemeRiverChart,
  // SunburstChart,
  // CustomChart,
} from 'echarts/charts';

// 引入所需的组件，带有 Component 后缀
import {
  // GridSimpleComponent,
  GridComponent,
  // PolarComponent,
  // RadarComponent,
  // GeoComponent,
  // SingleAxisComponent,
  // ParallelComponent,
  // CalendarComponent,
  // GraphicComponent,
  ToolboxComponent,
  TooltipComponent,
  // AxisPointerComponent,
  // BrushComponent,
  TitleComponent,
  // TimelineComponent,
  // MarkPointComponent,
  // MarkLineComponent,
  // MarkAreaComponent,
  LegendComponent,
  // LegendScrollComponent,
  // LegendPlainComponent,
  // DataZoomComponent,
  // DataZoomInsideComponent,
  // DataZoomSliderComponent,
  // VisualMapComponent,
  // VisualMapContinuousComponent,
  // VisualMapPiecewiseComponent,
  // AriaComponent,
  // TransformComponent,
  // DatasetComponent,
} from 'echarts/components';

// 引入渲染器，CanvasRenderer 或 SVGRenderer 是必需的
import {
  CanvasRenderer,
  // SVGRenderer,
} from 'echarts/renderers';
import { EChartsInstance, EChartsOption } from 'echarts-for-react/lib/types';

// 注册所需的图表和组件
echarts.use([
  // 注册图表
  LineChart,
  BarChart,
  // 注册组件
  GridComponent,
  ToolboxComponent,
  TooltipComponent,
  TitleComponent,
  LegendComponent,
  // 注册渲染器
  CanvasRenderer,
]);

interface EchartsProps {
  getOptions: () => EChartsOption;
}

// 定义 CChart 组件
const CChart = (props: EchartsProps) => {
  // 图表就绪后的回调函数，用于调整图表大小
  const onChartReadyCallback = (chart: EChartsInstance) => {
    chart.resize(); // 调整图表大小，解决宽度超出的问题
    setTimeout(() => {
      chart.resize(); // 延迟调整图表大小，确保尺寸正确
    }, 300);
  };

  const { getOptions } = props;

  // 返回 ECharts 图表组件
  return (
    <ReactEChartsCore
      echarts={echarts} // 传入 echarts 实例
      option={getOptions()} // 设置图表的配置项
      // notMerge // 可选，是否不跟之前设置的 option 进行合并，默认为 false
      lazyUpdate // 可选，在设置完 option 后是否不立即更新图表，默认为 false
      style={{ width: '100%', height: '360px' }} // 设置图表样式
      onChartReady={onChartReadyCallback} // 图表就绪回调
      // onEvents={EventsDict} // 可选，图表事件绑定
      opts={{ width: 'auto', height: 360 }} // 附加参数：设备像素比、渲染器、宽度、高度
      // opts={{ renderer: 'svg' }} // 可选，设置渲染器为 SVG
    />
  );
};

// 导出 CChart 组件
export default CChart;
