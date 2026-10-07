import { BadRequestException } from '@nestjs/common';

export const privateFields = [
  'dataState',
  'yesterday',
  'marketFacts',
  'marketJudgment',
  'themes',
  'execution',
  'candidates',
  'normalPlan',
  'strongPlan',
  'weakPlan',
  'lesson',
  'toolEvidence',
] as const;
export const publicFields = [
  'title',
  'summary',
  'market',
  'themes',
  'watch',
  'lesson',
  'sources',
] as const;
export interface NotebookContent {
  private: Record<string, string>;
  public: Record<string, string>;
}

export function parseNotebook(raw: string): NotebookContent {
  try {
    const value = JSON.parse(raw);
    if (
      !value ||
      Object.keys(value).some((k) => !['private', 'public'].includes(k))
    )
      throw new Error();
    const section = (data: unknown, allowed: readonly string[]) => {
      if (!data || typeof data !== 'object' || Array.isArray(data))
        throw new Error();
      if (Object.keys(data).some((k) => !allowed.includes(k)))
        throw new Error();
      return Object.fromEntries(
        allowed.map((k) => {
          const text = (data as Record<string, unknown>)[k] ?? '';
          if (
            typeof text !== 'string' ||
            text.length > (k === 'toolEvidence' ? 12000 : 4000)
          )
            throw new Error();
          return [k, text];
        }),
      );
    };
    return {
      private: section(value.private, privateFields),
      public: section(value.public, publicFields),
    };
  } catch {
    throw new BadRequestException('复盘字段格式或长度不符合要求');
  }
}

// Publication is deliberately built only from the dedicated, user-edited public section.
export function publicationText(
  date: string,
  content: NotebookContent,
  channel: 'wechat' | 'xueqiu',
) {
  const p = content.public;
  const entries =
    channel === 'wechat'
      ? [
          ['今日结论', p.summary],
          ['市场变化', p.market],
          ['方向与题材', p.themes],
          ['后续观察', p.watch],
          ['复盘经验', p.lesson],
          ['资料来源与时间', p.sources],
        ]
      : [
          ['核心观点', p.summary],
          ['市场与方向', [p.market, p.themes].filter(Boolean).join('\n\n')],
          ['接下来观察', p.watch],
          ['经验与来源', [p.lesson, p.sources].filter(Boolean).join('\n\n')],
        ];
  return [
    `# ${p.title || `${date} 市场复盘`}`,
    `复盘日期：${date}`,
    ...entries
      .filter(([, v]) => v?.trim())
      .map(([label, text]) => `## ${label}\n${text}`),
  ].join('\n\n');
}
