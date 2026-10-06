import type { TrajectoryRow } from '@/api/market';

export function chainView(value: string | null) {
  return value === 'trajectory' || value === 'history' ? value : 'ladder';
}

export function filterTrajectories(rows: TrajectoryRow[], date: string, keyword: string, state: string) {
  const search = keyword.trim().toLowerCase();
  return rows.filter((row) => {
    if (!`${row.name} ${row.tsCode}`.toLowerCase().includes(search)) return false;
    const cell = row.cells.find((item) => item.date === date);
    if (state === 'all') return true;
    if (state === '连板') return (cell?.height ?? 0) >= 2;
    if (state === '待补齐') return !cell || ['无行情', '待更新'].includes(cell.state);
    return cell?.state === state;
  });
}
