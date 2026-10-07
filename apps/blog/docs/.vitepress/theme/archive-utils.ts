export type ArchiveItem = { text: string; link: string; title?: string; date?: string };

export function archiveDate(item: ArchiveItem): string {
  const match = (item.date || item.text).match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:-|$)/);
  if (!match) return '';
  const [, year, month, day] = match;
  const value = new Date(Date.UTC(+year, +month - 1, +day));
  if (value.getUTCFullYear() !== +year || value.getUTCMonth() !== +month - 1 || value.getUTCDate() !== +day) return '';
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

export function archiveMonths(items: ArchiveItem[]) {
  const groups = new Map<string, ArchiveItem[]>();
  for (const item of items) {
    const month = archiveDate(item).slice(0, 7);
    if (month) groups.set(month, [...(groups.get(month) || []), item]);
  }
  return [...groups].sort(([a], [b]) => b.localeCompare(a)).map(([month, entries]) => ({
    month, items: entries.sort((a, b) => archiveDate(b).localeCompare(archiveDate(a)) || a.link.localeCompare(b.link)),
  }));
}

export function filterArchive(items: ArchiveItem[], month: string, date: string) {
  return items.filter(item => date ? archiveDate(item) === date : !month || archiveDate(item).slice(0, 7) === month)
    .sort((a, b) => archiveDate(b).localeCompare(archiveDate(a)) || a.link.localeCompare(b.link));
}

export function reviewTitle(title: string) {
  const text = title.replace(/^\d{4}-\d{1,2}-\d{1,2}\s*/, '').trim();
  return text === '数据' ? '复盘数据' : text || '历史复盘';
}

export function archiveLabel(item: ArchiveItem) {
  const date = archiveDate(item);
  const suffix = item.text.replace(/^\d{4}-\d{1,2}-\d{1,2}/, '').replace(/^-/, '');
  return date + (suffix ? `（版本 ${suffix}）` : '');
}
