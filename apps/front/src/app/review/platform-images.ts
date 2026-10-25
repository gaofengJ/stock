/* eslint-disable no-restricted-syntax, no-await-in-loop, no-loop-func, no-continue -- Sequential captures have per-page and batch deadlines. */
import { Article, ArticleImage, validateArticle } from './article-contract';
import { encodeCapture } from './capture-image';

export const captureSources = [
  {
    key: 'overview', title: '市场概览', path: '/analysis/overview/', query: '', charts: ['comparison', 'market', 'breadth', 'extremes'],
  },
  {
    key: 'emotion', title: '情绪指标', path: '/analysis/senti/', query: '', charts: ['sentiment', 'intraday', '上涨与下跌家数', '涨停、跌停与炸板', '封板率与炸板率', '最高连板', '昨日涨停股今日表现', '昨日涨停股今日平均涨幅'],
  },
  {
    key: 'ladder', title: '连板分析', path: '/analysis/chains/', query: '&view=history', charts: ['最高连板', '涨停梯队数量（含首板）', '连板晋级率', '首板与连板成交额'],
  },
  {
    key: 'limits', title: '涨停板复盘', path: '/analysis/limits/', query: '', charts: ['themes'],
  },
  {
    key: 'sectors20', title: '20日板块轮动', path: '/analysis/sectors/', query: '&kind=I&period=20', charts: ['sectors'],
  },
];
export const imageId = (key: string) => `platform-dark-v1-${key}-0`;
const belongsTo = (image: ArticleImage, key: string) => new RegExp(`^platform-dark-v1-${key}-\\d+$`).test(image.id);
function completeGroup(images: ArticleImage[], key: string) {
  const first = images.find((image) => image.id === imageId(key));
  if (!first) return false;
  try {
    const count = Number(new URL(first.source || '', 'https://stock.invalid').searchParams.get('imageParts') || 1);
    return Number.isInteger(count) && count > 0 && count <= 20 && Array.from({ length: count }, (_, index) => index).every((index) => images.some((image) => image.id === `platform-dark-v1-${key}-${index}` && image.source === first.source));
  } catch { return false; }
}
export function missingPlatformImages(images: ArticleImage[]) {
  return captureSources.filter((item) => !completeGroup(images, item.key)).map((item) => item.key);
}
export function currentPlatformImages(images: ArticleImage[], revision: string) {
  return images.filter((image) => {
    if (!image.id.startsWith('platform-')) return true;
    try { return new URL(image.source, 'https://stock.invalid').searchParams.get('dataRevision') === revision; } catch { return false; }
  });
}
export function mergePlatformImages(article: Article, images: ArticleImage[], revision?: string) {
  const existing = revision ? currentPlatformImages(article.images, revision) : article.images;
  const ids = new Set(images.map((image) => image.id));
  const replaced = captureSources.filter((item) => completeGroup(images, item.key));
  const complete = missingPlatformImages([...existing, ...images]).length === 0;
  return validateArticle({ ...article, images: [...existing.filter((image) => !ids.has(image.id) && !replaced.some((item) => belongsTo(image, item.key)) && !(complete && image.id.startsWith('platform-') && !image.id.startsWith('platform-dark-v1-'))), ...images] });
}
const pause = (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); });
async function bounded<T>(work: Promise<T>, ms: number, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw new DOMException('已取消', 'AbortError');
  let timer: ReturnType<typeof setTimeout>; let abort: () => void;
  return Promise.race([work, new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error('图片准备超时')), Math.max(1, ms));
    abort = () => reject(new DOMException('已取消', 'AbortError')); signal.addEventListener('abort', abort, { once: true });
  })]).finally(() => { clearTimeout(timer); signal.removeEventListener('abort', abort); });
}
// eslint-disable-next-line default-param-last -- Preserve existing callers while adding incremental capture.
export async function capturePlatform(date: string, signal: AbortSignal, progress: (message: string) => void, keys = captureSources.map((item) => item.key), revision = '', onCaptured?: (image: ArticleImage, group: ArticleImage[]) => Promise<void>, existingImages: ArticleImage[] = []) {
  const images: ArticleImage[] = []; const failures: string[] = [];
  const selected = captureSources.filter((source) => keys.includes(source.key));
  let accepted = existingImages;
  const batchDeadline = Date.now() + 120000;
  for (const [index, item] of selected.entries()) {
    if (signal.aborted) break;
    if (Date.now() >= batchDeadline) { failures.push(`${item.title}：本轮准备超时，可单独重试`); continue; }
    progress(`准备图片 ${index + 1}/${selected.length}：${item.title}`);
    const frame = document.createElement('iframe'); frame.title = '准备复盘原图'; frame.setAttribute('aria-hidden', 'true'); frame.tabIndex = -1;
    Object.assign(frame.style, {
      position: 'fixed', left: '-20000px', top: '0', width: '1100px', height: '1000px', border: '0', pointerEvents: 'none',
    });
    frame.src = `${item.path}?date=${date}&scope=all&reviewCapture=1${item.query}`; document.body.appendChild(frame);
    const deadline = Math.min(batchDeadline, Date.now() + 45000);
    try {
      let nodes: HTMLElement[] = []; let ready = false;
      while (Date.now() < deadline) {
        if (signal.aborted) throw new DOMException('已取消', 'AbortError');
        const doc = frame.contentDocument;
        nodes = item.charts.map((key) => doc?.querySelector<HTMLElement>(`[data-review-capture="${key}"]`)).filter((node): node is HTMLElement => !!node);
        const frameRevision = doc?.querySelector<HTMLElement>('[data-capture-revision]')?.dataset.captureRevision;
        if (revision && frameRevision && frameRevision !== revision) throw new Error('数据版本已变化，请重新准备图文资料');
        ready = (!revision || frameRevision === revision) && doc?.documentElement.dataset.theme === 'dark' && nodes.length === item.charts.length && nodes.every((node) => node.dataset.reviewDate === date && node.dataset.reviewReady === 'true' && !!node.querySelector('canvas') && !node.closest('[aria-hidden="true"],.is-pending') && !node.querySelector('[aria-busy="true"],.loading-placeholder'));
        if (ready) break;
        await pause(250);
      }
      if (!ready) throw new Error('当日图表尚未就绪');
      await bounded(frame.contentDocument!.fonts.ready, deadline - Date.now(), signal); await bounded(pause(1200), deadline - Date.now(), signal);
      const { toCanvas } = await import('html-to-image'); const canvases: HTMLCanvasElement[] = [];
      for (const node of nodes) {
        const native = node.querySelector<HTMLCanvasElement>('canvas[data-review-long-image]');
        canvases.push(native || await bounded(toCanvas(node, {
          pixelRatio: 1.5,
          backgroundColor: '#1c1f26',
          skipFonts: true,
          style: { margin: '0', borderRadius: '0' },
          filter: (child) => !(child.nodeType === 1 && (child as HTMLElement).dataset.reviewCaptureIgnore === 'true'),
        }), deadline - Date.now(), signal));
      }
      const width = 1440; const heights = canvases.map((canvas) => Math.round((canvas.height * width) / canvas.width));
      const height = 76 + heights.reduce((sum, value) => sum + value, 0);
      if (height > 30000 || height * width > 45000000) throw new Error('长图超出浏览器限制');
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('浏览器不支持图片导出');
      ctx.fillStyle = '#1c1f26'; ctx.fillRect(0, 0, width, height); ctx.fillStyle = '#e6e8ed'; ctx.font = '26px "Microsoft YaHei", sans-serif'; ctx.fillText(`${date}  ${item.title}  全市场`, 24, 48);
      let top = 76; canvases.forEach((part, index) => { ctx.drawImage(part, 0, top, width, heights[index]); top += heights[index]; });
      const breaks: number[] = []; let offset = 76;
      canvases.forEach((part, index) => {
        try { for (const point of JSON.parse(part.dataset?.reviewBreaks || '[]')) if (typeof point === 'number') breaks.push(offset + Math.round((point * width) / part.width)); } catch { /* Missing optional row boundaries falls back to complete pixel ranges. */ }
        offset += heights[index]; breaks.push(offset);
      });
      const retained = accepted.filter((image) => !belongsTo(image, item.key));
      const missing = missingPlatformImages(accepted);
      const future = selected.slice(index + 1).filter((source) => missing.includes(source.key));
      const weight = (key: string) => (key === 'limits' ? 3 : 1);
      const budget = Math.floor(((6000000 - retained.reduce((sum, image) => sum + image.data.length, 0)) * weight(item.key)) / (weight(item.key) + future.reduce((sum, source) => sum + weight(source.key), 0)));
      const encoded = encodeCapture(canvas, budget, 20 - retained.length - future.length, breaks);
      const source = `${window.location.origin}${item.path}?date=${date}${item.query}&dataRevision=${encodeURIComponent(revision)}${encoded.length > 1 ? `&imageParts=${encoded.length}&imageSet=${crypto.randomUUID()}` : ''}`;
      const group: ArticleImage[] = encoded.map((data, part) => ({
        id: `platform-dark-v1-${item.key}-${part}`,
        data,
        caption: `${date} ${item.title}（暗色，${item.charts.length}组平台原图${encoded.length > 1 ? `，第${part + 1}/${encoded.length}张` : ''}）`,
        source,
        after: item.title,
      }));
      if (onCaptured) await bounded(onCaptured(group[0], group), batchDeadline - Date.now(), signal);
      accepted = mergePlatformImages({ body: '', feishuUrl: '', images: accepted }, group).images;
      images.push(...group);
    } catch (error) { if (signal.aborted) break; failures.push(`${item.title}：${(error as Error).message}`); } finally { frame.remove(); }
  }
  return { images, failures };
}
