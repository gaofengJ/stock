import { ArticleImage, Evidence } from './article-contract';

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

export function evidenceImage(date: string, evidence: Evidence): ArticleImage {
  const values = evidence.points.slice(0, 12);
  if (!values.length) throw new Error('没有可绘制的数据');
  const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 190 + values.length * 64;
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('浏览器不支持图表导出');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#17202a'; ctx.font = 'bold 32px sans-serif'; ctx.fillText(`${date} ${evidence.title}`, 40, 55);
  ctx.font = '20px sans-serif'; ctx.fillStyle = '#596574'; ctx.fillText(`单位：${evidence.unit || '数值'}；按所列样本展示`, 40, 95);
  const min = Math.min(0, ...values.map((p) => p.value)); const max = Math.max(1, ...values.map((p) => p.value));
  const x = (v: number) => 330 + ((v - min) / (max - min)) * 680;
  values.forEach((p, index) => {
    const y = 120 + index * 64;
    ctx.font = '22px sans-serif'; ctx.fillStyle = '#17202a'; ctx.fillText(p.label, 40, y + 27, 275);
    ctx.fillStyle = p.value >= 0 ? '#d73557' : '#21876b'; ctx.fillRect(Math.min(x(0), x(p.value)), y, Math.max(1, Math.abs(x(p.value) - x(0))), 38);
    ctx.fillStyle = '#17202a'; ctx.fillText(p.value.toFixed(evidence.unit === '家' ? 0 : 2), 1030, y + 27);
  });
  ctx.font = '18px sans-serif'; ctx.fillStyle = '#596574'; ctx.fillText(`来源：木风同学 ${evidence.source}`, 40, canvas.height - 28, 1120);
  return {
    id: crypto.randomUUID(), data: canvas.toDataURL('image/png'), caption: `${date} ${evidence.title}`, source: evidence.source, after: ['sectors', 'themes'].includes(evidence.key) ? '题材与资金线索' : '市场与主线',
  };
}
