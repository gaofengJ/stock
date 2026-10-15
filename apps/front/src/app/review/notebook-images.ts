import { NotebookContent } from './notebook-model';
import { validateArticle } from './article-contract';

/** Resolve transport references before enabling edits, save, copy or export. */
export async function loadNotebookImages(
  content: NotebookContent | null,
  signal: AbortSignal,
  load: (hash: string) => Promise<string>,
): Promise<NotebookContent | null> {
  if (!content?.article) return content;
  const images = content.article.images.map((image) => ({ ...image }));
  const loaded = new Map<string, Promise<string>>();
  let cursor = 0;
  const worker = async () => {
    while (cursor < images.length) {
      if (signal.aborted) throw new Error('读取已取消');
      const image = images[cursor]; cursor += 1;
      const match = /^review-asset:([a-f0-9]{64})$/.exec(image.data);
      if (match) {
        if (!loaded.has(match[1])) loaded.set(match[1], load(match[1]));
        // eslint-disable-next-line no-await-in-loop
        image.data = await loaded.get(match[1])!;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(images.length, 4) }, worker));
  if (signal.aborted) throw new Error('读取已取消');
  return { ...content, article: validateArticle({ ...content.article, images }) };
}

export async function fetchNotebookImage(hash: string, signal: AbortSignal): Promise<string> {
  const response = await fetch(`/api/review/notebook/images/${hash}`, { credentials: 'same-origin', cache: 'no-cache', signal });
  if (!response.ok) throw new Error('复盘图片读取失败，请重新读取。');
  const blob = await response.blob();
  if (!['image/png', 'image/jpeg'].includes(blob.type) || blob.size > 2250000) throw new Error('复盘图片格式或大小不正确');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('复盘图片读取失败'));
    reader.readAsDataURL(blob);
  });
}
