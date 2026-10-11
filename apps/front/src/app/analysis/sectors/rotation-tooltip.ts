import type { TooltipComponentOption } from 'echarts';
import type { SectorBoard, SectorRow } from '@/api/sectors';
import { numberText } from '@/utils/format';

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]!));

export default function rotationTooltip(rotation: SectorBoard['rotation'], rows: Pick<SectorRow, 'code' | 'name'>[], period: 1 | 5 | 20): TooltipComponentOption {
  return {
    trigger: 'item',
    // A confined canvas tooltip can cover the hovered top row and become the
    // next hit-test target. HTML with pointer-events disabled keeps that cell
    // under the pointer even when the tooltip has to overlap it at an edge.
    renderMode: 'html',
    enterable: false,
    confine: true,
    position: 'top',
    transitionDuration: 0,
    extraCssText: 'pointer-events: none;',
    formatter: (params) => {
      const value = !Array.isArray(params) && params.value;
      if (!Array.isArray(value)) return '';
      const cell = rotation[Number(value[0])];
      const row = rows[Number(value[1])];
      if (!cell || !row) return '';
      const entry = cell.values.find((item) => item.code === row.code);
      return [
        cell.date,
        row.name,
        `${period === 1 ? '当日' : `${period}日`}涨跌幅 ${numberText(entry?.value, 2, true)}${entry?.value == null ? '' : '%'}`,
        `排名 ${entry?.rank ?? '—'}／${cell.total}`,
      ].map(escapeHtml).join('<br/>');
    },
  };
}
