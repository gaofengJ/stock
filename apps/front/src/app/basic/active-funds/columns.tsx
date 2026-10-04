import Link from 'next/link';
import type { ColumnsType } from 'antd/es/table/interface';
import { normalizeOrg } from '@/utils/active-funds';

/**
 * 设置默认值
 */
// const renderEmptyField = (val: any) => (val || '-');

export const useActiveFundsColumns = (selectedOrg = ''): ColumnsType => [
  {
    title: '游资名称',
    dataIndex: 'name',
    width: 120,
    render: (val: string) => (<div className="text-center">{val}</div>),
  },
  {
    title: '关联营业部 / 席位',
    dataIndex: 'orgs',
    render: (val: string[]) => (
      <div className="flex items-center flex-wrap mt-[-8px] py-16">
        {val.map((i) => (
          <Link href={`/basic/active-funds/detail/?org=${encodeURIComponent(i)}`} key={i} className={`active-funds-org${normalizeOrg(i) === normalizeOrg(selectedOrg) ? ' is-selected' : ''}`}>{i}</Link>
        ))}
      </div>
    ),
  },
  {
    title: '说明',
    dataIndex: 'desc',
    width: 400,
  },
];
