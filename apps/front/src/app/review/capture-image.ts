/* eslint-disable no-restricted-syntax -- Ordered canvas ranges preserve every source pixel. */
export function imageRanges(height: number, breaks: number[] = [], maxHeight = 6000) {
  const safe = breaks.filter((point) => Number.isFinite(point) && point > 0 && point < height).map(Math.floor).sort((a, b) => a - b);
  const ranges: { start: number; height: number }[] = [];
  let start = 0;
  while (start < height) {
    const currentStart = start;
    const target = Math.min(height, start + maxHeight);
    const end = target === height ? height : safe.filter((point) => point > currentStart && point <= target).at(-1) || target;
    ranges.push({ start, height: end - start }); start = end;
  }
  return ranges;
}

/** Export complete, readable pages within the existing server image limits. */
export function encodeCapture(canvas: HTMLCanvasElement, budget: number, maxParts: number, breaks: number[] = []) {
  const ranges = imageRanges(canvas.height, breaks);
  if (ranges.length > maxParts || budget <= 0) throw Error('配图空间不足，请减少手动配图后重试');
  const pages = ranges.length === 1 ? [canvas] : ranges.map((range) => {
    const page = document.createElement('canvas'); page.width = canvas.width; page.height = range.height;
    const context = page.getContext('2d'); if (!context) throw Error('浏览器不支持图片导出');
    context.drawImage(canvas, 0, range.start, canvas.width, range.height, 0, 0, canvas.width, range.height);
    return page;
  });
  try {
    const png = pages.map((page) => page.toDataURL('image/png'));
    if (png.every((data) => data.startsWith('data:image/png;base64,') && data.length <= 1400000) && png.reduce((sum, data) => sum + data.length, 0) <= budget) return png;
    for (const quality of [0.92, 0.86, 0.8, 0.74, 0.68]) {
      const images = pages.map((page) => page.toDataURL('image/jpeg', quality));
      if (images.every((data) => data.startsWith('data:image/jpeg;base64,') && data.length <= 3000000) && images.reduce((sum, data) => sum + data.length, 0) <= budget) return images;
    }
    throw Error('配图总量超限，请减少手动配图后重试');
  } finally {
    pages.filter((page) => page !== canvas).forEach((page) => { page.width = 0; page.height = 0; });
  }
}
