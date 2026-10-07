export interface HandlingJob {
  status: string;
  handling?: string;
  successorId?: number;
  successorStatus?: string;
}
export const handlingLabels: Record<string, string> = {
  'needs-attention': '需人工处理',
  'auto-retry': '等待自动重试',
  'source-wait': '等待数据源',
  recovered: '后续任务已完成',
  continued: '后续任务已接续',
  ignored: '已忽略',
};
export function handlingMessage(job: HandlingJob): string | undefined {
  if (job.handling === 'ignored') return '管理员已确认无需补齐。忽略标记仅作用于指定数据，原始执行记录保留。';
  if (job.handling === 'recovered') return `任务 #${job.successorId} 已完成同类型、完整日期范围的校验。本条保留历史失败，无需重复执行。`;
  if (job.handling === 'continued') {
    const stopped = ['failed', 'interrupted', 'paused'].includes(job.successorStatus || '');
    return `同类型、完整日期范围已由任务 #${job.successorId} 接续。${stopped ? '请检查后续任务，处理原始缺口。' : '请关注后续任务的进度，数据缺口仍在处理。'}本条无需重复执行。`;
  }
  if (job.handling === 'source-wait') return '源端暂未提供所需数据，系统到期会再次检查。无需反复重新排队，等待源端不会增加失败次数。';
  if (job.handling === 'needs-attention') return '当前没有覆盖完整范围的后续任务。请查看错误原因，确认后重新排队。';
  if (job.handling === 'auto-retry') return '系统会在下次重试时间继续执行，请先等待自动处理。';
  return undefined;
}
export const isHistorical = (job: HandlingJob) => ['recovered', 'continued', 'ignored'].includes(job.handling || '');
export const needsWarning = (job: HandlingJob) => (job.handling ? job.handling === 'needs-attention' : ['failed', 'interrupted'].includes(job.status));
export const canRequeue = (job: HandlingJob) => !isHistorical(job) && job.handling !== 'source-wait' && ['failed', 'pending', 'interrupted', 'paused'].includes(job.status);
