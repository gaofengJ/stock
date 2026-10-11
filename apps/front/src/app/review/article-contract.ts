// Shared client/server contract; regression tests check both implementations.
export interface ArticleImage { id: string; data: string; caption: string; source: string; after: string }
export interface Article { body: string; images: ArticleImage[]; feishuUrl: string }
export interface Evidence { key: string; title: string; text: string; source: string; state: 'ready' | 'missing'; points: { label: string; value: number }[]; unit: string }
export interface Research { date: string; fetchedAt: string; sections: Evidence[] }
export const emptyArticle = (): Article => ({ body: '', images: [], feishuUrl: '' });
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('资料格式错误');
  return value as Record<string, unknown>;
}
export function bounded(value: unknown, max: number): string {
  if (typeof value !== 'string' || value.length > max) throw new Error('内容格式或长度超限');
  return value;
}
export function validateArticle(input: unknown): Article {
  const value = object(input);
  const body = bounded(value.body, 40000);
  const feishuUrl = bounded(value.feishuUrl, 1500);
  if (feishuUrl) {
    const url = new URL(feishuUrl);
    if (url.protocol !== 'https:' || !/(^|\.)feishu\.cn$/.test(url.hostname) || url.username || url.password || url.port || !/^\/(docx|docs)\/[a-zA-Z0-9]+$/.test(url.pathname)) throw new Error('请填写有效的飞书文档链接');
  }
  if (!Array.isArray(value.images) || value.images.length > 20) throw new Error('每篇文章最多 20 张图片');
  const ids = new Set<string>(); let size = 0;
  const images = value.images.map((raw) => {
    const image = object(raw);
    const id = bounded(image.id, 80);
    if (!/^[a-zA-Z0-9_-]+$/.test(id) || ids.has(id)) throw new Error('图片标识重复或无效');
    ids.add(id);
    const data = bounded(image.data, 500000);
    if (!/^data:image\/(png|jpeg);base64,[a-zA-Z0-9+/]+={0,2}$/.test(data)
      || !(data.startsWith('data:image/png;base64,iVBORw0KGgo') || data.startsWith('data:image/jpeg;base64,/9j/'))) throw new Error('仅支持有效的 PNG、JPEG 图片');
    size += data.length;
    return {
      id, data, caption: bounded(image.caption, 300), source: bounded(image.source, 1500), after: bounded(image.after, 100),
    };
  });
  if (size > 6000000) throw new Error('图片总量超过限制，请减少图片或压缩后重试');
  return { body, images, feishuUrl };
}
export function validateResearch(input: unknown): Research {
  const value = object(input);
  const date = bounded(value.date, 10); const fetchedAt = bounded(value.fetchedAt, 40);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(fetchedAt))) throw new Error('资料日期无效');
  if (!Array.isArray(value.sections) || value.sections.length > 12) throw new Error('资料数量超限');
  const sections = value.sections.map((raw) => {
    const s = object(raw);
    if (!['ready', 'missing'].includes(String(s.state)) || !Array.isArray(s.points) || s.points.length > 30) throw new Error('资料状态无效');
    const source = bounded(s.source, 1500);
    if (!/^\/(analysis\/[a-z-]+|news)\?date=\d{4}-\d{2}-\d{2}$/.test(source)) throw new Error('资料来源地址无效');
    const points = s.points.map((rawPoint) => {
      const p = object(rawPoint);
      if (typeof p.value !== 'number' || !Number.isFinite(p.value)) throw new Error('图表数值无效');
      return { label: bounded(p.label, 80), value: p.value };
    });
    return {
      key: bounded(s.key, 40), title: bounded(s.title, 100), text: bounded(s.text, 8000), source, state: s.state as Evidence['state'], points, unit: bounded(s.unit, 20),
    };
  });
  return { date, fetchedAt, sections };
}
export function illustratedText(body: string, images: ArticleImage[]) {
  const blocks = body.split(/\n(?=## )/); const inserted = new Set<string>();
  const result = blocks.map((block) => {
    const heading = block.match(/^## (.+)/)?.[1]?.trim() || '';
    const placed = images.filter((image) => image.after === heading && !inserted.has(image.id));
    placed.forEach((image) => inserted.add(image.id));
    return [block, ...placed.map((image) => `![${image.caption.replace(/[[\]\n]/g, ' ')}](review-image:${image.id})`)].join('\n\n');
  });
  return [...result, ...images.filter((image) => !inserted.has(image.id)).map((image) => `![${image.caption.replace(/[[\]\n]/g, ' ')}](review-image:${image.id})`)].join('\n\n');
}
