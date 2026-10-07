'use client';

import { useState } from 'react';
import {
  Button, Card, Descriptions, Drawer, Empty, Grid, Select, Space, Tag, message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DownloadOutlined } from '@ant-design/icons';
import Table from '@/components/DataTable';
import { ExternalLink, InteractionButton } from '@/components/Interaction';
import { useSiteTheme } from '@/components/SiteTheme';
import { errorMessage } from '@/api/errors';
import { numberText, scaledNumber } from '@/utils/format';
import { SourceState, StockLink } from '../../basic/components/workbench';
import { DataState, SectionTitle } from '../components/MarketCharts';
import { useMarket } from '../components/MarketContext';
import { scopes } from '../components/market-display';
import { ThemeBoard, ThemeDetail, ThemeStock } from './theme-review.types';
import useThemeReview from './useThemeReview';
import { exportThemeReview } from './theme-review-export';
import './theme-review.css';

function ThemeDetailPanel({ stock, close }: { stock: ThemeStock | null; close: () => void }) {
  const { date } = useMarket();
  const result = useThemeReview<ThemeDetail>('theme-review-detail', { code: stock?.tsCode }, !!stock);
  const { data } = result;
  return (
    <Drawer open={!!stock} title={`${stock?.name || ''} · 资料解析`} width={760} onClose={close} destroyOnClose>
      <DataState loading={result.loading} error={result.error} retry={result.retry} empty={!data}>
        {data && (
        <div className="theme-review-detail">
          <Space wrap>
            <StockLink code={data.stock.tsCode} name={data.stock.name} date={date} />
            <span className="basic-muted">{date}</span>
          </Space>
          <SourceState data={data} error="" retry={result.retry} pollingStopped={result.pollingStopped} loading={result.loading} />
          <section>
            <SectionTitle title="涨停原因" description="来自当日榜单的原因摘要；相关公告和业绩资料可用于进一步核验。" />
            <p className="theme-review-reason">{data.stock.reason || '暂无涨停原因资料'}</p>
            <Space size={[4, 8]} wrap>{data.stock.themes.map((name) => <Tag key={name}>{name}</Tag>)}</Space>
            <p className="basic-muted">来源：开盘啦（经 Tushare）</p>
          </section>
          <section>
            <SectionTitle title="已披露业绩" description="仅展示截至复盘日期已披露的最近报告期数据。" />
            {data.financial ? (
              <Descriptions
                size="small"
                column={{
                  xs: 1, sm: 2, md: 2, lg: 2, xl: 2, xxl: 2,
                }}
                bordered
                items={[
                  { key: 'period', label: '报告期', children: data.financial.period },
                  { key: 'announcedAt', label: '披露日期', children: data.financial.announcedAt },
                  { key: 'revenue', label: '营收同比(%)', children: numberText(data.financial.revenueGrowth, 2, true) },
                  { key: 'profit', label: '净利润同比(%)', children: numberText(data.financial.profitGrowth, 2, true) },
                  { key: 'deducted', label: '扣非净利润(亿)', children: scaledNumber(data.financial.deductedProfit, 100000000) },
                  { key: 'roe', label: '净资产收益率(%)', children: numberText(data.financial.roe) },
                ]}
              />
            ) : <p className="basic-muted">{data.sources.some((s) => s.source === 'fina_indicator' && s.state !== 'ready') ? '业绩资料尚未就绪' : '未取得截至该日已披露的业绩资料'}</p>}
          </section>
          <section>
            <SectionTitle title="相关公告" description={`展示 ${data.announcementStart} 至 ${date} 已发布的公司公告；与涨停的关联需结合原文核实。`} />
            {data.announcements.length ? (
              <ul className="theme-review-notices">
                {data.announcements.map((notice) => (
                  <li key={`${notice.date}:${notice.title}`}>
                    <span>{notice.date}</span>
                    {notice.url ? <ExternalLink href={notice.url}>{notice.title}</ExternalLink> : <span>{notice.title}</span>}
                  </li>
                ))}
              </ul>
            ) : <p className="basic-muted">{data.sources.some((s) => s.source === 'eastmoney_ann' && s.state !== 'ready') ? '公告资料尚未就绪' : '近30日未检索到公司公告'}</p>}
          </section>
        </div>
        )}
      </DataState>
    </Drawer>
  );
}

export default function ThemeReview({ keyword, height, sector }: { keyword: string; height?: number; sector?: string }) {
  const { date, scope } = useMarket();
  const { colors } = useSiteTheme();
  const screens = Grid.useBreakpoint();
  const result = useThemeReview<ThemeBoard>('theme-review', { keyword, height, sector });
  const [theme, setTheme] = useState<string>();
  const [stock, setStock] = useState<ThemeStock | null>(null);
  const [exporting, setExporting] = useState(false);
  const { data } = result;
  const groups = (data?.groups || []).filter((group) => !theme || group.name === theme);
  const visibleStocks = groups.flatMap((group) => group.items);
  const pending = data?.sources.some((source) => source.state !== 'ready');
  const download = async () => {
    setExporting(true);
    try { await exportThemeReview(groups, date, scopes.find((item) => item.value === scope)?.label || scope, colors, data?.sources[0]?.fetchedAt); } catch (error) { message.error(errorMessage(error, '图片导出失败')); } finally { setExporting(false); }
  };
  const columns: ColumnsType<ThemeStock> = [
    {
      title: '股票',
      key: 'stock',
      width: 160,
      fixed: 'left',
      render: (_, row) => (
        <div className="limits-stock-cell">
          <StockLink code={row.tsCode} name={row.name} date={date} />
          <span className="limits-stock-code">{row.tsCode}</span>
        </div>
      ),
    },
    {
      title: '收盘价(元)', dataIndex: 'close', width: 104, align: 'right', render: (value) => numberText(value),
    },
    {
      title: '成交额(亿)', dataIndex: 'amount', width: 112, align: 'right', render: (value) => scaledNumber(value, 100000000), sorter: (a, b) => Number(a.amount) - Number(b.amount),
    },
    {
      title: '最后封板', dataIndex: 'lastTime', width: 104, align: 'center', render: (value) => value || '—',
    },
    {
      title: '涨停记录', key: 'height', width: 116, align: 'center', render: (_, row) => row.sourceStatus || (row.limitTimes === 1 ? '首板' : `${row.limitTimes}连板`),
    },
    {
      title: '涨停原因',
      key: 'reason',
      width: 350,
      render: (_, row) => (
        <div className="theme-review-reason">
          {row.reason || <span className="basic-muted">暂无涨停原因</span>}
          {row.themes.length > 1 && (
          <small>
            关联题材：
            {row.themes.slice(1).join('、')}
          </small>
          )}
        </div>
      ),
    },
    {
      title: '资料解析', key: 'detail', width: 104, fixed: screens.md ? 'right' : undefined, align: 'center', render: (_, row) => <InteractionButton intent="preview" onClick={() => setStock(row)} aria-label={`查看${row.name}资料解析`}>查看</InteractionButton>,
    },
  ];
  return (
    <div className="theme-review">
      <div className="limits-table-toolbar">
        <SectionTitle title="题材复盘" description="非ST涨停股票按当日来源的首个题材归组，每股计一次；其他题材保留为关联标签。分组按家数、最高连板排序，组内按连板数和最后封板时间排序。" />
        <Space wrap>
          <Select aria-label="复盘题材" allowClear showSearch placeholder="全部题材" value={theme} onChange={setTheme} style={{ width: 180 }} options={(data?.groups || []).map((group) => ({ value: group.name, label: `${group.name}（${group.count}）` }))} />
          <Button icon={<DownloadOutlined />} loading={exporting} disabled={result.loading || !!result.error || !groups.length || !!pending} onClick={download}>导出长图</Button>
        </Space>
      </div>
      <DataState loading={result.loading} error={result.error} retry={result.retry} empty={!data?.ready}>
        {data && <SourceState data={data} error="" retry={result.retry} pollingStopped={result.pollingStopped} loading={result.loading} />}
        {data && <p className="theme-review-summary">{`当前筛选 ${visibleStocks.length} 只 · 已取得题材 ${visibleStocks.filter((row) => row.themes.length).length} 只 · 已取得原因 ${visibleStocks.filter((row) => row.reason).length} 只`}</p>}
        {!groups.length && <Empty description="没有符合筛选条件的涨停股票" />}
        {groups.map((group) => (
          <Card
            key={group.name}
            size="small"
            className="theme-review-group"
            title={(
              <span>
                {group.name}
                <span className="theme-review-count">
                  {group.count}
                  只
                </span>
              </span>
)}
            extra={(
              <span className="basic-muted">
                最高
                {group.maxHeight}
                板 · 成交额
                {scaledNumber(group.amount, 100000000)}
                亿
              </span>
)}
          >
            {!!group.keywords.length && <p className="theme-review-keywords">{group.keywords.join(' · ')}</p>}
            <Table<ThemeStock> autoHeight size="small" bordered tableLayout="fixed" rowKey="tsCode" columns={columns} dataSource={group.items} pagination={false} scroll={{ x: 1150 }} />
          </Card>
        ))}
      </DataState>
      <ThemeDetailPanel stock={stock} close={() => setStock(null)} />
    </div>
  );
}
