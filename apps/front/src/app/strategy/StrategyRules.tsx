'use client';

import { Collapse, Tag } from 'antd';
import HelpTooltip from '@/components/HelpTooltip';
import { isTrendStrategy, trendDefaults, TrendOptions } from './TrendParameters';

const rules: Record<string, { summary: string; detail: string }> = {
  gapThreeUp: { summary: '向上缺口 + 连续三天收阳', detail: '从跳空日起连续三天收阳。后续低点始终高于跳空前一天最高价，允许部分回补，触及缺口下沿则排除。' },
  gapTwoUp: { summary: '向上缺口 + 连续两天收阳', detail: '从跳空日起连续两天收阳。后续低点始终高于跳空前一天最高价，允许部分回补，触及缺口下沿则排除。' },
  gapThreeHighTurnover: { summary: '向上缺口 + 三天换手率均 > 5%', detail: '从跳空日起三天自由流通换手率均大于5%；跳空当天成交额高于前一天。后续低点始终高于跳空前一天最高价，不要求收阳。' },
  threeDaysHighVol: { summary: '连续三天收阳', detail: '连续三个交易日收盘价均高于当日开盘价。不限制量比，不要求形成缺口。' },
  continuousGap: { summary: '连续两次完整向上缺口', detail: '连续两天最低价均高于前一天最高价，不要求收阳。' },
  shadowWrap: { summary: '向上缺口 + 上影反包', detail: '跳空日上影长度大于昨收价的3%；次日收阳且收盘突破跳空日最高价，低点仍高于跳空前一天最高价。' },
};

export default function StrategyRules({ strategy, options = trendDefaults }: { strategy: string; options?: TrendOptions }) {
  const trend = isTrendStrategy(strategy);
  const newRules: typeof rules = {
    volumeBreakout: { summary: `收盘突破前${options.breakoutDays}日高点 + 成交量 ≥ ${options.volumeMultiple}倍均量`, detail: `收盘高于此前${options.breakoutDays}个交易日最高价，成交量至少为此前${options.volumeDays}日均量的${options.volumeMultiple}倍。两项基准均不包含当日。` },
    breakoutPullback: { summary: '放量突破 + 缩量回踩 + 当日收阳回升', detail: `近${options.pullbackDays}个交易日内，最近一次满足放量突破条件的日期作为突破日。至少间隔一个回踩日；当日最低价位于突破位下方${options.pullbackBelow}%至上方${options.pullbackAbove}%之间，突破后收盘均未跌破下方容差。当日收阳、收盘高于昨日及突破位；中间回踩日均量不超过突破日成交量的${Math.round(options.contractionRatio * 100)}%。` },
    fiveMaUp: { summary: `MA5 > MA10 > MA20 > MA60 > MA120，五线均向上${options.fiveMaMode === 'new' ? '，当日新形成' : ''}`, detail: `五条均线按短到长依次排列，且每条均高于上一交易日。${options.fiveMaMode === 'new' ? '只选昨日未满足、今日满足的股票。' : '选择今日满足的股票，展示已持续天数。'}${options.aboveMa5 ? '要求收盘高于MA5。' : ''}${options.bullish ? '要求当日收阳。' : ''}${options.expandingVolume ? `要求当日成交量不低于前${options.volumeDays}日均量的${options.volumeMultiple}倍。` : ''}` },
  };
  const rule = newRules[strategy] || rules[strategy];
  if (!rule) return null;
  return (
    <div className="strategy-rules mb-16">
      <div className="strategy-rules-summary">
        <span className="strategy-rules-label">筛选条件</span>
        <strong>{rule.summary}</strong>
        <div className="strategy-rules-common">
          <Tag>成交额 &gt; 5000万</Tag>
          <Tag>排除一字涨停</Tag>
          <Tag>{trend ? '当日收盘在上半区' : '末日收盘在上半区'}</Tag>
          <HelpTooltip label="共同条件" title={trend ? '共同条件检查信号日；回踩策略的突破日也需满足。排除ST、退市整理及上市初期股票。' : '成交额及一字涨停限制适用于每个形态日；收盘位置只检查最后一天。'} />
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
              {trend ? <p>跨日价格和均线采用后复权行情。停牌缺价或上市历史不足时不参与；历史标记按默认参数回看。</p> : (
                <>
                  <p>不要求收盘逐日上涨或成交量逐日增加。末日收盘不低于当天最高价与最低价的中点。</p>
                  <p>{strategy === 'threeDaysHighVol' ? '形态日为连续三个交易日。' : '形态日从首次跳空日开始，不含跳空前的基准日。'}</p>
                </>
              )}
            </div>
          ),
        }]}
      />
    </div>
  );
}
