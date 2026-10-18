'use client';

import { useState } from 'react';
import { Button, Drawer } from 'antd';
import { RobotOutlined } from '@ant-design/icons';
import { useAccount } from '@/auth/Boundary';
import { isPersonalAiOwner } from '@/auth/client';
import AnalysisPanel, { Candidate } from './AnalysisPanel';
import { Skill, StrategyContext } from './client';

export default function BusinessAction({
  skill, date, candidates = [], disabled = false, disabledReason, strategy,
}: {
  skill: Skill; date: string; candidates?: Candidate[]; disabled?: boolean; disabledReason?: string; strategy?: StrategyContext;
}) {
  const { user } = useAccount();
  const [context, setContext] = useState<{ date: string; candidates: Candidate[]; strategy?: StrategyContext } | null>(null);
  if (!isPersonalAiOwner(user)) return null;
  const title = skill === 'market-review' ? '智能复盘' : '智能对比';
  let unavailable = disabled ? disabledReason || '当前数据尚未就绪，请稍后再试。' : '';
  if (!date) unavailable = '请先选择有效的交易日期。';
  const instructions = skill === 'market-review'
    ? '选择复盘日期，点击智能复盘，在侧栏输入问题后开始分析。'
    : '选择策略和日期，点击智能对比，在侧栏选择1至3只股票后开始分析。';
  return (
    <>
      <section className="personal-ai-entry" aria-label={`${title}入口`}>
        <div>
          <strong>{title}</strong>
          <p>
            {instructions}
            打开侧栏不会调用模型。
          </p>
          {unavailable && <p role="status">{unavailable}</p>}
        </div>
        <Button type="primary" icon={<RobotOutlined />} disabled={!!unavailable} onClick={() => setContext({ date, candidates: [...candidates], strategy })}>{title}</Button>
      </section>
      <Drawer title={title} open={!!context} onClose={() => setContext(null)} width={680} styles={{ wrapper: { maxWidth: '100vw' } }} destroyOnClose>
        {context && <AnalysisPanel ownerId={user!.id} skill={skill} date={context.date} candidates={context.candidates} strategy={context.strategy} />}
      </Drawer>
    </>
  );
}
