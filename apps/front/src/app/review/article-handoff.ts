import { Article, object, validateArticle } from './article-contract';
import { NotebookContent, publicText } from './notebook-model';

// Explicit allowlist: never serialize the notebook's private section.
export function reviewPacket(date: string, revision: number, content: NotebookContent) {
  return {
    schema: 'stock-review/v1', date, revision, article: content.article || { body: publicText(date, content, 'wechat'), images: [], feishuUrl: '' }, research: content.research || null,
  };
}
export function readResult(raw: string, date: string, revision: number): Article {
  const value = object(JSON.parse(raw));
  if (value.schema !== 'stock-review/v1' || value.date !== date || value.revision !== revision) throw new Error('返回结果的日期或版本不匹配，请以当前已保存版本重新交接');
  return validateArticle(value.article);
}
