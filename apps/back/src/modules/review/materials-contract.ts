import { bounded, object } from './article-contract';

export interface MaterialLink {
  id: string;
  title: string;
  url: string;
  note: string;
}
export interface CalendarMaterial {
  id: string;
  date: string;
  title: string;
  detail: string;
  source: string;
}
export interface Materials {
  links: MaterialLink[];
  calendar: CalendarMaterial[];
  showCalendar: boolean;
  includeExecution: boolean;
}
export const emptyMaterials = (): Materials => ({
  links: [],
  calendar: [],
  showCalendar: false,
  includeExecution: false,
});
export function materialUrl(input: unknown) {
  const text = bounded(input, 1500);
  const url = new URL(text);
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error('请输入完整的 http 或 https 素材链接');
  return text;
}
export function validateMaterials(input: unknown): Materials {
  const value = object(input);
  if (
    typeof value.showCalendar !== 'boolean' ||
    typeof value.includeExecution !== 'boolean'
  )
    throw new Error('素材选项无效');
  const list = <T>(
    raw: unknown,
    map: (item: Record<string, unknown>) => T,
  ): T[] => {
    if (!Array.isArray(raw) || raw.length > 40)
      throw new Error('每类素材最多 40 项');
    const ids = new Set<string>();
    return raw.map((entry) => {
      const item = object(entry);
      const id = bounded(item.id, 200);
      if (!id || ids.has(id)) throw new Error('素材标识重复或无效');
      ids.add(id);
      return map(item);
    });
  };
  return {
    showCalendar: value.showCalendar,
    includeExecution: value.includeExecution,
    links: list(value.links, (item) => ({
      id: String(item.id),
      title: bounded(item.title, 300),
      url: materialUrl(item.url),
      note: bounded(item.note, 2000),
    })),
    calendar: list(value.calendar, (item) => {
      const date = bounded(item.date, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('事件日期无效');
      return {
        id: String(item.id),
        date,
        title: bounded(item.title, 300),
        detail: bounded(item.detail, 4000),
        source: materialUrl(item.source),
      };
    }),
  };
}
