'use client';

import { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button, Drawer } from 'antd';
import { RobotOutlined } from '@ant-design/icons';
import { useAccount } from '@/auth/Boundary';
import { isPersonalAiOwner } from '@/auth/client';
import AnalysisPanel, { Candidate, PrepareAnalysis } from './AnalysisPanel';
import { Skill, StrategyContext, Task } from './client';

export default function BusinessAction({
  skill, date, candidates = [], disabled = false, disabledReason, strategy, compact = false, beforeStart, onComplete, initialCodes = [], canApplySections = false, openRequest = 0,
}: {
  skill: Skill; date: string; candidates?: Candidate[]; disabled?: boolean; disabledReason?: string; strategy?: StrategyContext; compact?: boolean; beforeStart?: PrepareAnalysis; onComplete?: (task: Task, section?: string) => void; initialCodes?: string[]; canApplySections?: boolean; openRequest?: number;
}) {
  const { user } = useAccount();
  const params = useSearchParams(); const taskId = params?.get('aiTask') || '';
  const [open, setOpen] = useState(false);
  const [context, setContext] = useState<{ date: string; candidates: Candidate[]; strategy?: StrategyContext; codes?: string[]; taskId?: string } | null>(null);
  const opening = useRef({ candidates, strategy, initialCodes }); opening.current = { candidates, strategy, initialCodes };
  useEffect(() => {
    if (taskId || (openRequest && skill === 'market-review')) {
      setContext({
        date, candidates: [...opening.current.candidates], strategy: opening.current.strategy, codes: opening.current.initialCodes, taskId,
      }); setOpen(true);
    }
  }, [taskId, date, skill, openRequest]);
  const close = () => { setOpen(false); const url = new URL(window.location.href); url.searchParams.delete('aiTask'); window.history.replaceState(null, '', url); };
  if (!isPersonalAiOwner(user)) return null;
  const title = skill === 'market-review' ? '生成复盘' : '智能对比';
  let unavailable = disabled ? disabledReason || '当前数据尚未就绪，请稍后再试。' : '';
  if (!date) unavailable = '请先选择有效的交易日期。';
  const instructions = skill === 'market-review'
    ? '确认复盘日期，可补充关注重点，然后开始生成。'
    : '选择策略和日期，点击智能对比，在侧栏选择1至3只股票后开始分析。';
  return (
    <>
      {compact ? (
        <Button
          type="primary"
          aria-label={title}
          icon={<RobotOutlined />}
          disabled={!!unavailable}
          onClick={() => {
            setContext({
              date, candidates: [...candidates], strategy, codes: initialCodes,
            }); setOpen(true);
          }}
        >
          {title}
        </Button>
      ) : (
        <section className="personal-ai-entry" aria-label={`${title}入口`}>
          <div>
            <strong>{title}</strong>
            <p>
              {instructions}
              打开侧栏不会调用模型。
            </p>
            {unavailable && <p role="status">{unavailable}</p>}
          </div>
          <Button
            type="primary"
            aria-label={title}
            icon={<RobotOutlined />}
            disabled={!!unavailable}
            onClick={() => {
              setContext({
                date, candidates: [...candidates], strategy, codes: initialCodes,
              }); setOpen(true);
            }}
          >
            {title}
          </Button>
        </section>
      )}
      <Drawer className="personal-ai-drawer" title={title} open={open} onClose={close} footer={<Button onClick={close}>关闭</Button>} width="min(1040px, 100vw)" styles={{ wrapper: { maxWidth: '100vw' } }}>
        {context && <AnalysisPanel key={JSON.stringify([context.date, context.strategy, context.codes, context.taskId])} initialCodes={context.codes} initialTaskId={context.taskId} canApplySections={canApplySections} ownerId={user!.id} skill={skill} date={context.date} candidates={context.candidates} strategy={context.strategy} beforeStart={beforeStart} onComplete={onComplete} />}
      </Drawer>
    </>
  );
}
