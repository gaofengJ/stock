import { beijingTime, numberText, scaledNumber } from '@/utils/format';
import { reviewSummary } from './theme-review-content';
import type { ThemeGroup } from './theme-review.types';

type Palette = { surface: string; surfaceMuted: string; text: string; secondary: string; border: string; primaryText: string };
const widths = [180, 120, 140, 140, 140, 700];
const font = '"Microsoft YaHei", "PingFang SC", sans-serif';

/** Real canvas text avoids remote fonts, cross-origin images and clipped scrolling tables. */
export async function exportThemeReview(groups: ThemeGroup[], date: string, scope: string, colors: Palette, fetchedAt?: string | null) {
  if (!groups.length) throw new Error('当前筛选结果为空');
  await document.fonts.ready;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('浏览器暂不支持图片导出');
  ctx.font = `20px ${font}`;
  const wrap = (text: string, width: number) => {
    const lines: string[] = [];
    let line = '';
    Array.from(text).forEach((character) => {
      if (character === '\n' || (line && ctx.measureText(line + character).width > width)) { lines.push(line); line = character === '\n' ? '' : character; } else line += character;
    });
    if (line) lines.push(line);
    return lines.length ? lines : ['—'];
  };
  const sections = groups.map((group) => ({
    group,
    rows: group.items.map((stock) => {
      const cells = [
        `${stock.name}\n${stock.tsCode}`, numberText(stock.close), scaledNumber(stock.amount, 100000000), stock.lastTime || '—', stock.sourceStatus || (stock.limitTimes === 1 ? '首板' : `${stock.limitTimes}连板`),
        reviewSummary(stock.detailReason) || '个股解析待补充',
      ].map((text, i) => wrap(text, widths[i] - 28));
      return { cells, height: Math.max(84, ...cells.map((lines) => lines.length * 30 + 28)) };
    }),
  }));
  const height = 220 + sections.reduce((sum, s) => sum + 112 + s.rows.reduce((total, row) => total + row.height, 0), 0);
  if (height > 30000) throw new Error('结果较多，请筛选题材后导出');
  canvas.width = 1480; canvas.height = height;
  ctx.fillStyle = colors.surface; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textBaseline = 'top';
  ctx.font = `600 30px ${font}`; ctx.fillStyle = colors.text; ctx.fillText('题材涨停复盘', 30, 24);
  ctx.font = `20px ${font}`; ctx.fillStyle = colors.secondary;
  ctx.fillText(`${date}    ${scope}    当前筛选 ${groups.reduce((sum, g) => sum + g.count, 0)} 只    ${groups.length} 个分组`, 30, 72);
  ctx.fillText('按同花顺热点复盘原始题材归组。题材与个股解析来源：同花顺。', 30, 108);
  let y = 154;
  sections.forEach(({ group, rows }) => {
    ctx.fillStyle = colors.surfaceMuted; ctx.fillRect(30, y, 1420, 56);
    ctx.font = `600 23px ${font}`; ctx.fillStyle = colors.text; ctx.fillText(`${group.name}（${group.count}只）`, 44, y + 14);
    y += 56;
    let x = 30;
    ctx.font = `20px ${font}`; ctx.fillStyle = colors.secondary;
    ['股票', '收盘价(元)', '成交额(亿)', '最后封板', '涨停记录', '资料解析'].forEach((label, i) => { ctx.fillText(label, x + 14, y + 16); x += widths[i]; });
    y += 56;
    rows.forEach(({ cells, height: rowHeight }) => {
      x = 30;
      cells.forEach((lines, i) => {
        ctx.fillStyle = colors.text; ctx.font = `20px ${font}`;
        lines.forEach((line, j) => {
          const left = [1, 2].includes(i) ? x + widths[i] - 14 - ctx.measureText(line).width : x + 14;
          ctx.fillText(line, left, y + 14 + j * 30);
        });
        x += widths[i];
      });
      ctx.strokeStyle = colors.border; ctx.beginPath(); ctx.moveTo(30, y + rowHeight); ctx.lineTo(1450, y + rowHeight); ctx.stroke();
      y += rowHeight;
    });
  });
  ctx.fillStyle = colors.secondary; ctx.font = `18px ${font}`;
  ctx.fillText(`木风同学    数据获取时间：${beijingTime(fetchedAt || undefined)}    资料解析及来源链接可在站内查看`, 30, y + 22);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => (value ? resolve(value) : reject(new Error('图片生成失败，请缩小范围后重试'))), 'image/png');
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `题材复盘-${date}.png`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
