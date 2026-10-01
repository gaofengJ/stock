import { numberText, scaledNumber, changeClass } from '@/utils/format';
import type { ColumnsType } from 'antd/es/table/interface';
import SectorLinks from '@/components/SectorLinks';
import Link from 'next/link';
import { Popover, Space } from 'antd';
import { useAccount } from '@/auth/Boundary';
import { allowedPath } from '@/auth/client';

interface SectorPerformance { code: string; name: string; type: string; asOf: string; day: number | null; five: number | null; twenty: number | null; maxHeight: number | null }

function SectorContext({ sectors, date, ready }: { sectors?: SectorPerformance[]; date: string; ready?: boolean }) {
  const { user } = useAccount();
  if (ready === false) return <span>背景暂不可用</span>;
  if (!sectors?.length) return <span>—</span>;
  const details = sectors.map((s) => (
    <div key={s.code}>
      {allowedPath(user, '/analysis/sectors') ? (
        <Link href={`/analysis/sectors/?${new URLSearchParams({
          date, scope: 'all', kind: s.type, code: s.code,
        })}`}
        >
          {s.name}
        </Link>
      ) : s.name}
      <Space size={12} wrap>
        <span>
          当日
          <span className={changeClass(s.day)}>
            {numberText(s.day, 2, true)}
            {s.day == null ? '' : '%'}
          </span>
        </span>
        <span>
          5日
          <span className={changeClass(s.five)}>
            {numberText(s.five, 2, true)}
            {s.five == null ? '' : '%'}
          </span>
        </span>
        <span>
          最高
          {numberText(s.maxHeight, 0)}
          板
        </span>
        <span>
          成分截至
          {s.asOf}
        </span>
      </Space>
    </div>
  ));
  return (
    <Popover title="同花顺板块背景" content={<Space direction="vertical" style={{ maxWidth: 'min(700px, 85vw)', maxHeight: 400, overflow: 'auto' }}>{details}</Space>}>
      <span style={{ cursor: 'pointer' }}>
        {sectors[0].name}
        {' '}
        <span className={changeClass(sectors[0].day)}>
          {numberText(sectors[0].day, 2, true)}
          {sectors[0].day == null ? '' : '%'}
        </span>
        （
        {sectors.length}
        个板块）
      </span>
    </Popover>
  );
}

/**
 * 设置默认值
 */
const renderEmptyField = (val: unknown) => numberText(val);

export const strategyColumns: ColumnsType = [
  {
    title: '股票代码',
    dataIndex: 'tsCode',
    key: 'tsCode',
    width: 80,
    fixed: 'left',
    render: (val) => val.split('.')[0],
  },
  {
    title: '股票名称',
    dataIndex: 'name',
    key: 'name',
    width: 80,
  },
  {
    title: '行业', key: 'industry', width: 160, render: (_, r) => <SectorLinks stock={r} date={r.tradeDate} />,
  },
  {
    title: '题材', key: 'topics', width: 240, render: (_, r) => <SectorLinks stock={r} type="N" date={r.tradeDate} />,
  },
  {
    title: '板块背景', key: 'context', width: 280, render: (_, r) => <SectorContext sectors={r.sectorPerformance} date={r.tradeDate} ready={r.sectorContextReady} />,
  },
  {
    title: '开盘价(元)',
    dataIndex: 'open',
    key: 'open',
    width: 80,
    align: 'right',
    render: renderEmptyField,
  },
  {
    title: '收盘价(元)',
    dataIndex: 'close',
    key: 'close',
    width: 80,
    align: 'right',
    render: renderEmptyField,
  },
  {
    title: '最高价(元)',
    dataIndex: 'high',
    key: 'high',
    width: 80,
    align: 'right',
    render: renderEmptyField,
  },
  {
    title: '最低价(元)',
    dataIndex: 'low',
    key: 'low',
    width: 80,
    align: 'right',
    render: renderEmptyField,
  },
  {
    title: '成交额(亿元)',
    dataIndex: 'amount',
    key: 'amount',
    width: 96,
    align: 'right',
    render: (val) => scaledNumber(val, 100000),
  },
  {
    title: '自由流通换手率(%)',
    dataIndex: 'turnoverRateF',
    key: 'turnoverRateF',
    width: 136,
    align: 'right',
    render: renderEmptyField,
  },
  {
    title: '量比',
    dataIndex: 'volumeRatio',
    key: 'volumeRatio',
    width: 80,
    align: 'right',
    render: renderEmptyField,
  },
  {
    title: '市盈率(ttm)',
    dataIndex: 'peTtm',
    key: 'peTtm',
    width: 80,
    align: 'right',
    // Legacy imports filled missing PE with zero. PE=0 is not a usable valuation.
    render: (val) => numberText(Number(val) === 0 ? null : val),
  },
  {
    title: '总市值(亿元)',
    dataIndex: 'totalMv',
    key: 'totalMv',
    width: 104,
    align: 'right',
    render: (val) => scaledNumber(val, 10000),
  },
  {
    title: '流通市值(亿元)',
    dataIndex: 'circMv',
    key: 'circMv',
    width: 104,
    align: 'right',
    render: (val) => scaledNumber(val, 10000),
  },
];
