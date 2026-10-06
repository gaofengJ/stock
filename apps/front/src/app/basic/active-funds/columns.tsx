import Link from '@/components/Interaction';
import { Button } from 'antd';
import type { ColumnsType } from 'antd/es/table/interface';
import type { NSGetBasicActiveFundsList } from '@/api/services.types';
import { normalizeOrg, uniqueFundOrgs } from '@/utils/active-funds';

/**
 * 设置默认值
 */
// const renderEmptyField = (val: any) => (val || '-');

type Fund = NSGetBasicActiveFundsList.IRes[number];
export const useActiveFundsColumns = (selectedOrg: string, onDetail: (fund: Fund) => void): ColumnsType<Fund> => [
  {
    title: '游资名称',
    dataIndex: 'name',
    width: '16%',
    render: (name, fund) => <Button className="active-funds-name" type="link" onClick={() => onDetail(fund)}>{name}</Button>,
  },
  {
    title: '关联营业部 / 席位',
    dataIndex: 'orgs',
    width: '42%',
    render: (orgs: string[], fund) => {
      const seats = uniqueFundOrgs(orgs);
      const selected = seats.find((seat) => normalizeOrg(seat) === normalizeOrg(selectedOrg));
      const ordered = selected ? [selected, ...seats.filter((seat) => seat !== selected)] : seats;
      return seats.length ? (
        <div className="active-funds-seats">
          {ordered.slice(0, seats.length > 2 ? 1 : 2).map((seat) => <Link title={seat} href={`/basic/active-funds/detail/?org=${encodeURIComponent(seat)}`} key={seat} className={`active-funds-org${normalizeOrg(seat) === normalizeOrg(selectedOrg) ? ' is-selected' : ''}`}>{seat}</Link>)}
          {seats.length > 2 && <Button type="link" size="small" onClick={() => onDetail(fund)}>{`全部 ${seats.length} 个席位`}</Button>}
        </div>
      ) : <span className="active-funds-muted">暂无关联席位</span>;
    },
  },
  {
    title: '简介',
    dataIndex: 'desc',
    render: (desc: string) => <span className="active-funds-summary">{desc || '暂无简介'}</span>,
  },
  {
    title: '',
    key: 'detail',
    width: 76,
    render: (_, fund) => <Button type="link" size="small" onClick={() => onDetail(fund)}>详情</Button>,
  },
];
