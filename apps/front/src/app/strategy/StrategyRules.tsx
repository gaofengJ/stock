'use client';

import { Collapse, Tag } from 'antd';
import HelpTooltip from '@/components/HelpTooltip';

const rules: Record<string, { summary: string; detail: string }> = {
  gapThreeUp: { summary: '向上缺口 + 连续三天收阳', detail: '从跳空日起连续三天收阳。后续低点始终高于跳空前一天最高价，允许部分回补，触及缺口下沿则排除。' },
  gapTwoUp: { summary: '向上缺口 + 连续两天收阳', detail: '从跳空日起连续两天收阳。后续低点始终高于跳空前一天最高价，允许部分回补，触及缺口下沿则排除。' },
  gapThreeHighTurnover: { summary: '向上缺口 + 三天换手率均 > 5%', detail: '从跳空日起三天自由流通换手率均大于5%；跳空当天成交额高于前一天。后续低点始终高于跳空前一天最高价，不要求收阳。' },
  threeDaysHighVol: { summary: '连续三天收阳', detail: '连续三个交易日收盘价均高于当日开盘价。不限制量比，不要求形成缺口。' },
  continuousGap: { summary: '连续两次完整向上缺口', detail: '连续两天最低价均高于前一天最高价，不要求收阳。' },
  shadowWrap: { summary: '向上缺口 + 上影反包', detail: '跳空日上影长度大于昨收价的3%；次日收阳且收盘突破跳空日最高价，低点仍高于跳空前一天最高价。' },
};

export default function StrategyRules({ strategy }: { strategy: string }) {
  const rule = rules[strategy];
  if (!rule) return null;
  return (
    <div className="strategy-rules mb-16">
      <div className="strategy-rules-summary">
        <span className="strategy-rules-label">筛选条件</span>
        <strong>{rule.summary}</strong>
        <div className="strategy-rules-common">
          <Tag>成交额 &gt; 5000万</Tag>
          <Tag>排除一字涨停</Tag>
          <Tag>末日收盘在上半区</Tag>
          <HelpTooltip label="共同条件" title="成交额及一字涨停限制适用于每个形态日；收盘位置只检查最后一天。" />
        </div>
      </div>
      <Collapse
        ghost
        size="small"
        items={[{
          key: strategy,
          label: '完整规则',
          children: (
            <div className="strategy-rules-detail">
              <p>{rule.detail}</p>
              <p>不要求收盘逐日上涨或成交量逐日增加。末日收盘不低于当天最高价与最低价的中点。</p>
              <p>{strategy === 'threeDaysHighVol' ? '形态日为连续三个交易日。' : '形态日从首次跳空日开始，不含跳空前的基准日。'}</p>
            </div>
          ),
        }]}
      />
    </div>
  );
}
