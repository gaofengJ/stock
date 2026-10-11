import { ArticleImage } from './article-contract';

export async function readImage(file: File): Promise<ArticleImage> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 15 * 1024 * 1024) throw new Error('请选择 15 MB 以内的 PNG、JPEG 或 WebP 图片');
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width * bitmap.height > 60000000) throw new Error('图片像素过大，请缩小后上传');
    const scale = Math.min(1, 1800 / bitmap.width, 3200 / bitmap.height);
    const canvas = document.createElement('canvas'); canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('浏览器不支持图片处理');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    let data = canvas.toDataURL('image/png');
    if (data.length > 500000) data = canvas.toDataURL('image/jpeg', 0.82);
    if (data.length > 500000) data = canvas.toDataURL('image/jpeg', 0.6);
    if (data.length > 500000) throw new Error('压缩后图片仍过大，请裁剪或分成多张');
    return {
      id: crypto.randomUUID(), data, caption: file.name.replace(/\.[^.]+$/, '').slice(0, 300), source: '', after: '',
    };
  } finally { bitmap.close(); }
}
