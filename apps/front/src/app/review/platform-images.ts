/* eslint-disable no-restricted-syntax, no-continue, no-await-in-loop -- Capture pages sequentially to bound memory and wait for each live chart. */
import { Article, ArticleImage, validateArticle } from './article-contract';

export const captureSources = [
  {
    key: 'market', title: '市场成交额', path: '/analysis/overview/', selector: '[data-review-capture="market"]', stage: '市场观察',
  },
  {
    key: 'breadth', title: '均线广度', path: '/analysis/overview/', selector: '[data-review-capture="breadth"]', stage: '市场观察',
  },
  {
    key: 'sentiment', title: '市场情绪', path: '/analysis/senti/', selector: '[data-review-capture="sentiment"]', stage: '市场观察',
  },
  {
    key: 'feedback', title: '强势股反馈', path: '/analysis/senti/', selector: '[data-review-capture="feedback"]', stage: '市场观察',
  },
  {
    key: 'sectors', title: '板块轮动', path: '/analysis/sectors/', selector: '[data-review-capture="sectors"]', stage: '题材梳理',
  },
  {
    key: 'themes', title: '涨停题材', path: '/analysis/limits/', selector: '[data-review-capture="themes"]', stage: '题材梳理',
  },
];

export function mergePlatformImages(article: Article, images: ArticleImage[]) {
  const ids = new Set(images.map((image) => image.id.replace(/-\d+$/, '')));
  return validateArticle({ ...article, images: [...article.images.filter((image) => !ids.has(image.id.replace(/-\d+$/, ''))), ...images] });
}

export async function captureElement(node: HTMLElement, id: string, caption: string, source: string, after: string): Promise<ArticleImage[]> {
  const { toCanvas } = await import('html-to-image');
  const view = node.ownerDocument.defaultView!;
  await node.ownerDocument.fonts.ready;
  const backgroundColor = view.getComputedStyle(node).getPropertyValue('--color-bg-white').trim()
    || view.getComputedStyle(node.ownerDocument.body).backgroundColor || '#1c1f26';
  const canvas = await toCanvas(node, {
    pixelRatio: 1.4,
    backgroundColor,
    skipFonts: true,
    filter: (child) => !(child.nodeType === 1 && (child as HTMLElement).dataset.reviewCaptureIgnore === 'true'),
  });
  if (!canvas.width || !canvas.height) throw new Error('图表尚未完成绘制');
  // Split long tables without shrinking text. Images retain the platform's DOM and chart rendering.
  const images: ArticleImage[] = [];
  for (let top = 0; top < canvas.height; top += 2100) {
    const slice = document.createElement('canvas'); slice.width = canvas.width; slice.height = Math.min(2100, canvas.height - top);
    const ctx = slice.getContext('2d'); if (!ctx) throw new Error('浏览器不支持图片导出');
    ctx.drawImage(canvas, 0, top, canvas.width, slice.height, 0, 0, slice.width, slice.height);
    let data = slice.toDataURL('image/png');
    if (data.length > 500000) data = slice.toDataURL('image/jpeg', 0.85);
    if (data.length > 500000) data = slice.toDataURL('image/jpeg', 0.65);
    if (data.length > 500000) throw new Error('图表过大，请缩小范围后重试');
    images.push({
      id: `${id}-${images.length}`, data, caption, source, after,
    });
  }
  return images;
}

export async function capturePlatform(date: string, signal: AbortSignal, progress: (message: string) => void) {
  const images: ArticleImage[] = []; const failures: string[] = [];
  // Reuse one actual platform page per route. No duplicate chart implementation or remote screenshot service.
  for (const path of Array.from(new Set(captureSources.map((item) => item.path)))) {
    if (signal.aborted) throw new DOMException('已取消', 'AbortError');
    const frame = document.createElement('iframe');
    frame.title = '生成复盘配图'; frame.setAttribute('aria-hidden', 'true'); frame.tabIndex = -1;
    Object.assign(frame.style, {
      position: 'fixed', left: '-20000px', top: '0', width: '1440px', height: '1100px', border: '0', pointerEvents: 'none',
    });
    frame.src = `${path}?date=${date}&reviewCapture=1${path.includes('sectors') ? '&kind=N' : ''}`;
    document.body.appendChild(frame);
    const remove = () => frame.remove(); signal.addEventListener('abort', remove, { once: true });
    try {
      const pending = captureSources.filter((item) => item.path === path);
      const deadline = Date.now() + 45000;
      while (pending.length && Date.now() < deadline) {
        if (signal.aborted) throw new DOMException('已取消', 'AbortError');
        for (const item of [...pending]) {
          const node = frame.contentDocument?.querySelector<HTMLElement>(item.selector);
          if (!node || node.dataset.reviewDate !== date || node.dataset.reviewReady !== 'true') continue;
          if (node.closest('[aria-hidden="true"]') || node.querySelector('[aria-busy="true"],.is-pending')) continue;
          progress(`正在生成${item.title}图片`);
          // ECharts animations finish after data-ready. Capture the same rendered view seen on the platform.
          await new Promise((resolve) => { setTimeout(resolve, 1200); });
          if (signal.aborted) throw new DOMException('已取消', 'AbortError');
          try {
            images.push(...await captureElement(node, `platform-${item.key}`, `${date} ${item.title}`, `${window.location.origin}${path}?date=${date}${path.includes('sectors') ? '&kind=N' : ''}`, item.stage));
          } catch { failures.push(item.title); }
          pending.splice(pending.indexOf(item), 1);
        }
        if (pending.length) await new Promise((resolve) => { setTimeout(resolve, 250); });
      }
      failures.push(...pending.map((item) => item.title));
    } finally { signal.removeEventListener('abort', remove); frame.remove(); }
  }
  return { images, failures };
}
