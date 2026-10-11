import { BadRequestException } from '@nestjs/common';
import { Materials, validateMaterials } from './materials-contract';
import {
  Article,
  Research,
  validateArticle,
  validateResearch,
  illustratedText,
} from './article-contract';

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
  'holdingEvidence',
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
  article?: Article;
  research?: Research;
  materials?: Materials;
}

export function parseNotebook(raw: string): NotebookContent {
  try {
    const value = JSON.parse(raw);
    if (
      !value ||
      Object.keys(value).some(
        (k) =>
          !['private', 'public', 'article', 'research', 'materials'].includes(
            k,
          ),
      )
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
            text.length >
              ((
                { toolEvidence: 24000, holdingEvidence: 12000 } as Record<
                  string,
                  number
                >
              )[k] || 4000)
          )
            throw new Error();
          return [k, text];
        }),
      );
    };
    return {
      private: section(value.private, privateFields),
      ...(value.materials
        ? { materials: validateMaterials(value.materials) }
        : {}),
      public: section(value.public, publicFields),
      ...(value.article ? { article: validateArticle(value.article) } : {}),
      ...(value.research ? { research: validateResearch(value.research) } : {}),
    };
  } catch {
    throw new BadRequestException('复盘字段格式或长度不符合要求');
  }
}

// Publication is deliberately built only from the dedicated, user-edited public section.
export function publicationText(
  date: string,
  content: NotebookContent,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Both channels retain the same article format.
  _channel: 'wechat' | 'xueqiu',
) {
  if (content.article?.body.trim())
    return illustratedText(content.article.body, content.article.images);
  const p = content.public;
  const entries = [
    ['市场与主线', [p.market, p.themes].filter(Boolean).join('\n\n')],
    ['今日观察与应对', p.summary],
    ['明日观察计划', p.watch],
    ['一条总结', p.lesson],
    ['资料来源与时间', p.sources],
  ];
  return [
    `# ${p.title || `${date} 市场复盘`}`,
    `复盘日期：${date}`,
    ...entries
      .filter(([, v]) => v?.trim())
      .map(([label, text]) => `## ${label}\n${text}`),
  ].join('\n\n');
}
