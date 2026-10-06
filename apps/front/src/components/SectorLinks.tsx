'use client';

import Link, { InteractionButton } from '@/components/Interaction';
import { Space, Popover } from 'antd';
import { useAccount } from '@/auth/Boundary';
import { allowedPath } from '@/auth/client';
import type { ClassifiedStock, SectorLink } from '@/api/sectors';
import { sectorKindLabel } from './sector-terminology';

export function sectorHref(sector: SectorLink, date?: string) {
  return `/analysis/sectors/?${new URLSearchParams({ kind: sector.type, code: sector.code, ...(date ? { date } : {}) })}`;
}
export default function SectorLinks({ stock, type = 'I', date }: { stock: ClassifiedStock; type?: 'I' | 'N'; date?: string }) {
  const { user } = useAccount();
  const links = type === 'I' ? stock.industries : stock.topics;
  const visible = links?.slice(0, type === 'I' ? 3 : 2) || [];
  if (!visible.length) return <span className="quote-flat">—</span>;
  const renderLink = (s: SectorLink) => (allowedPath(user, '/analysis/sectors')
    ? <Link key={s.code} href={sectorHref(s, date)} title={`同花顺${sectorKindLabel(type)}${s.asOf ? `，成分截至${s.asOf}` : ''}`}>{s.name}</Link>
    : <span key={s.code}>{s.name}</span>);
  return (
    <Space size={6} wrap>
      {visible.map(renderLink)}
      {links!.length > visible.length && (
      <Popover title={`同花顺${sectorKindLabel(type)}`} content={<Space wrap style={{ maxWidth: 360 }}>{links!.slice(visible.length).map(renderLink)}</Space>} trigger={['hover', 'click']}>
        <InteractionButton intent="popover" aria-label={`展开其余${links!.length - visible.length}个${sectorKindLabel(type)}`}>
          <span>
            更多
            <span className="interaction-count">{links!.length - visible.length}</span>
          </span>
        </InteractionButton>
      </Popover>
)}
    </Space>
  );
}
