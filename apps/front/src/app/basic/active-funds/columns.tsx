import type { ColumnsType } from 'antd/es/table/interface';

/**
 * 设置默认值
 */
// const renderEmptyField = (val: any) => (val || '-');

export const useActiveFundsColumns = (): ColumnsType => [
  {
    title: '游资名称',
    dataIndex: 'name',
    width: 120,
    render: (val: string) => (<div className="text-center">{val}</div>),
  },
  {
    title: '关联机构',
    dataIndex: 'orgs',
    render: (val: string[]) => (
      <div className="flex item-center flex-wrap py-16">
        {val.map((i) => (
          <span key={i} className="px-8 mr-8 mt-8 first:mt-0 bg-bg-pink-red78 text-text-white rounded-full">{i}</span>
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
