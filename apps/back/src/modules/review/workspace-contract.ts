import { bounded, object } from './article-contract';

export interface WatchDraft {
  selected: { tsCode: string; name: string }[];
  notes: Record<string, string>;
  riskNotes: Record<string, string>;
  focus: string;
  exit: string;
  reason: string;
}
export interface CollectedItem {
  id: string;
  kind: 'stock' | 'news' | 'chart' | 'ai';
  date: string;
  title: string;
  url: string;
  note: string;
  createdAt: string;
  code?: string;
  name?: string;
  includeInArticle?: boolean;
}
export interface ReviewWorkspace {
  draft: WatchDraft;
  items: CollectedItem[];
}
export const emptyWorkspace = (): ReviewWorkspace => ({
  draft: {
    selected: [],
    notes: {},
    riskNotes: {},
    focus: '',
    exit: '',
    reason: '',
  },
  items: [],
});
export function validateWorkspace(input: unknown): ReviewWorkspace {
  const value = object(input);
  const draft = object(value.draft);
  if (
    !Array.isArray(draft.selected) ||
    draft.selected.length > 1000 ||
    !Array.isArray(value.items) ||
    value.items.length > 100
  )
    throw Error('观察股票或收录素材超出上限');
  const code = (raw: unknown) => {
    const text = bounded(raw, 12);
    if (!/^\d{6}\.(SH|SZ|BJ)$/.test(text)) throw Error('股票代码无效');
    return text;
  };
  const records = (raw: unknown) =>
    Object.fromEntries(
      Object.entries(object(raw)).map(([key, text]) => [
        code(key),
        bounded(text, 2000),
      ]),
    );
  const selected = draft.selected.map((raw) => {
    const row = object(raw);
    return { tsCode: code(row.tsCode), name: bounded(row.name, 100) };
  });
  if (new Set(selected.map((row) => row.tsCode)).size !== selected.length)
    throw Error('观察股票重复');
  const items = value.items.map((raw): CollectedItem => {
    const item = object(raw);
    const date = bounded(item.date, 10);
    const url = bounded(item.url, 1500);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !['stock', 'news', 'chart', 'ai'].includes(String(item.kind))
    )
      throw Error('素材类型或日期无效');
    const parsed = new URL(url, 'https://stock.invalid');
    if (
      !['http:', 'https:'].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password ||
      url.startsWith('//')
    )
      throw Error('素材链接无效');
    const createdAt = bounded(item.createdAt, 40);
    if (!Number.isFinite(Date.parse(createdAt))) throw Error('素材时间无效');
    return {
      id: bounded(item.id, 200),
      kind: item.kind as CollectedItem['kind'],
      date,
      title: bounded(item.title, 300),
      url,
      note: bounded(item.note, 12000),
      createdAt,
      ...(typeof item.includeInArticle === 'boolean'
        ? { includeInArticle: item.includeInArticle }
        : {}),
      ...(item.code
        ? { code: code(item.code), name: bounded(item.name || '', 100) }
        : {}),
    };
  });
  if (
    items.some((item) => !item.id) ||
    new Set(items.map((item) => item.id)).size !== items.length
  )
    throw Error('素材标识重复或为空');
  return {
    draft: {
      selected,
      notes: records(draft.notes),
      riskNotes: records(draft.riskNotes),
      focus: bounded(draft.focus, 2000),
      exit: bounded(draft.exit, 2000),
      reason: bounded(draft.reason, 2000),
    },
    items,
  };
}
export function mergeCollected(
  workspace: ReviewWorkspace,
  additions: CollectedItem[],
): ReviewWorkspace {
  const items = [...workspace.items];
  const selected = [...workspace.draft.selected];
  additions.forEach((item) => {
    if (!items.some((row) => row.id === item.id)) items.push(item);
    if (
      item.kind === 'stock' &&
      item.code &&
      !selected.some((row) => row.tsCode === item.code)
    )
      selected.push({ tsCode: item.code, name: item.name || item.code });
  });
  return validateWorkspace({ items, draft: { ...workspace.draft, selected } });
}
