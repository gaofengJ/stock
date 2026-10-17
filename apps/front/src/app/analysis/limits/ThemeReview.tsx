'use client';

import { useSearchParams } from 'next/navigation';
import {
  useEffect, useId, useRef, useState,
} from 'react';
import {
  Alert, Button, Collapse, Descriptions, Drawer, Empty, Select, Space, Tabs, message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DownloadOutlined } from '@ant-design/icons';
import SelectField from '@/components/SelectField';
import Table from '@/components/DataTable';
import { ExternalLink, InteractionButton } from '@/components/Interaction';
import { useSiteTheme } from '@/components/SiteTheme';
import { errorMessage } from '@/api/errors';
import { numberText, scaledNumber } from '@/utils/format';
import { StockIdentity } from '@/components/StockActions';
import { SourceState, StockLink } from '../../basic/components/workbench';
import { DataState, SectionTitle } from '../components/MarketCharts';
import { useMarket } from '../components/MarketContext';
import { scopes } from '../components/market-display';
import { ThemeBoard, ThemeDetail, ThemeStock } from './theme-review.types';
import useThemeReview from './useThemeReview';
import { exportThemeReview, themeReviewCanvas } from './theme-review-export';
import { reviewContent, reviewPoint, reviewSummary } from './theme-review-content';
import './theme-review.css';

function ThemeDetailPanel({ stock, close }: { stock: ThemeStock | null; close: () => void }) {
  const { date } = useMarket();
  const result = useThemeReview<ThemeDetail>('theme-review-detail', { code: stock?.tsCode }, !!stock);
  const { data } = result;
  const content = reviewContent(data?.stock.detailReason);
  return (
    <Drawer
      rootClassName="theme-review-drawer"
      open={!!stock}
      title={(
        <div className="theme-review-drawer-title">
          {stock && <StockLink code={stock.tsCode} name={stock.name} date={date} />}
          <span>资料解析</span>
        </div>
      )}
      width="min(720px, 100vw)"
      onClose={close}
      destroyOnClose
    >
      <DataState loading={result.loading} error={result.error} retry={result.retry} empty={!data}>
        {data && (
        <div className="theme-review-detail">
          <div className="theme-review-detail-meta">
            <span>{data.stock.tsCode}</span>
            <span>{date}</span>
            <span className="theme-review-detail-themes">{data.stock.themes.join('、')}</span>
          </div>
          <Tabs
            defaultActiveKey="review"
            items={[
              {
                key: 'review',
                label: '复盘解析',
                children: (
                  <div>
                    <h3 className="theme-review-detail-title">个股要点</h3>
                    {content.company.length ? (
                      <ol className="theme-review-points">
                        {content.company.map((point, index) => {
                          const item = reviewPoint(point);
                          return (
                            <li key={point}>
                              <span className="theme-review-point-number">{index + 1}</span>
                              <div>
                                <p>{item.text}</p>
                                {item.source && <small>{item.source}</small>}
                              </div>
                            </li>
                          );
                        })}
                      </ol>
                    ) : <p className="basic-muted">同花顺暂未提供个股解析</p>}
                    {(data.stock.reason || content.industry.length > 0) && (
                    <Collapse
                      ghost
                      className="theme-review-background"
                      items={[{
                        key: 'background',
                        label: '题材背景',
                        children: (
                          <div className="theme-review-reason">
                            {data.stock.reason && <p>{data.stock.reason}</p>}
                            {content.industry.map((point) => <p key={point}>{point}</p>)}
                          </div>
                        ),
                      }]}
                    />
                    )}
                    <div className="theme-review-attribution">
                      <div className="theme-review-source-row">
                        <ExternalLink href="https://eq.10jqka.com.cn/webpage/kamis-renderer/index.0.3.5.html?token=K79OTEyOQB5">来源：同花顺热点复盘</ExternalLink>
                        <SourceState data={{ sources: data.sources.filter((source) => source.source === 'ths_hot_review') }} error="" retry={result.retry} pollingStopped={result.pollingStopped} loading={result.loading} />
                      </div>
                      {content.disclaimer.map((text) => <p key={text}>{text}</p>)}
                    </div>
                  </div>
                ),
              },
              {
                key: 'documents',
                label: '业绩与公告',
                children: (
                  <div className="theme-review-documents">
                    <SourceState data={data} error="" retry={result.retry} pollingStopped={result.pollingStopped} loading={result.loading} />
                    <section>
                      <SectionTitle title="已披露业绩" description="仅展示截至复盘日期已披露的最近报告期数据。" />
                      {data.financial ? (
                        <Descriptions
                          size="small"
                          column={{
                            xs: 1, sm: 2, md: 2, lg: 2, xl: 2, xxl: 2,
                          }}
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
                ),
              },
            ]}
          />
        </div>
        )}
      </DataState>
    </Drawer>
  );
}

export default function ThemeReview({ keyword, height, sector }: { keyword: string; height?: number; sector?: string }) {
  const { date, scope } = useMarket();
  const { colors } = useSiteTheme();
  const result = useThemeReview<ThemeBoard>('theme-review', { keyword, height, sector });
  const capture = useSearchParams().get('reviewCapture') === '1';
  const captureNode = useRef<HTMLDivElement>(null);
  const [captureReady, setCaptureReady] = useState('');
  const [theme, setTheme] = useState<string>();
  const [collapsedThemes, setCollapsedThemes] = useState<string[]>([]);
  const groupId = useId();
  const [stock, setStock] = useState<ThemeStock | null>(null);
  const [exporting, setExporting] = useState(false);
  const { data } = result;
  const groups = (data?.groups || []).filter((group) => !theme || group.name === theme);
  const visibleStocks = groups.flatMap((group) => group.items);
  const pending = data?.sources.some((source) => source.state !== 'ready');
  useEffect(() => {
    if (!capture || !data?.ready || pending || !captureNode.current) return undefined;
    let active = true; setCaptureReady('');
    themeReviewCanvas(data.groups, date, '全市场', colors, data.sources[0]?.fetchedAt).then((canvas) => {
      if (active && captureNode.current) { canvas.dataset.reviewLongImage = 'true'; captureNode.current.replaceChildren(canvas); setCaptureReady(date); }
    }).catch(() => { if (active) setCaptureReady(''); });
    return () => { active = false; };
  }, [capture, data, date, colors, pending]);
  const download = async () => {
    setExporting(true);
    try { await exportThemeReview(groups, date, scopes.find((item) => item.value === scope)?.label || scope, colors, data?.sources[0]?.fetchedAt); } catch (error) { message.error(errorMessage(error, '图片导出失败')); } finally { setExporting(false); }
  };
  const columns: ColumnsType<ThemeStock> = [
    {
      title: '股票',
      key: 'stock',
      width: 144,
      fixed: 'left',
      render: (_, row) => <StockIdentity code={row.tsCode} name={row.name} date={date} />,
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
      title: '涨停记录', key: 'height', width: 100, align: 'center', render: (_, row) => <span className={row.limitTimes > 1 ? 'theme-review-height' : 'basic-muted'}>{row.sourceStatus || (row.limitTimes === 1 ? '首板' : `${row.limitTimes}连板`)}</span>,
    },
    {
      title: '资料解析',
      key: 'detail',
      render: (_, row) => (
        <div className="theme-review-core">
          <span className="theme-review-core-text">{reviewSummary(row.detailReason) || <span className="basic-muted">个股解析待补充</span>}</span>
          <InteractionButton intent="preview" onClick={() => setStock(row)} aria-label={`查看${row.name}资料解析`}>查看</InteractionButton>
        </div>
      ),
    },
  ];
  return (
    <div className="theme-review" data-review-capture="themes" data-review-date={data?.date} data-review-ready={!result.loading && !result.error && !!data?.ready && (capture ? captureReady === date : !!groups.length)}>
      {capture && <div ref={captureNode} />}
      <div className="limits-table-toolbar">
        <div className="theme-review-overview">
          <span>
            涨停
            <strong>{visibleStocks.length}</strong>
            <small>只</small>
          </span>
          <span>
            题材
            <strong>{groups.length}</strong>
            <small>个</small>
          </span>
          <span>
            最高连板
            <strong className="theme-review-height">{Math.max(0, ...visibleStocks.map((row) => row.limitTimes)) || '—'}</strong>
            <small>板</small>
          </span>
        </div>
        <Space wrap>
          <SelectField label="复盘题材"><Select className="theme-review-filter" aria-label="复盘题材" allowClear showSearch placeholder="全部题材" value={theme} onChange={setTheme} popupMatchSelectWidth={320} options={(data?.groups || []).map((group) => ({ value: group.name, label: `${group.name}（${group.count}）` }))} /></SelectField>
          <Button icon={<DownloadOutlined />} loading={exporting} disabled={result.loading || !!result.error || !groups.length || !!pending} onClick={download}>导出长图</Button>
        </Space>
      </div>
      {result.error && data?.ready && <Alert type="warning" message="涨停复盘更新失败，保留上次成功数据" description={result.error} action={<Button onClick={result.retry}>重试</Button>} />}
      <DataState loading={result.loading && !data?.ready} error={data?.ready ? '' : result.error} retry={result.retry} empty={!data?.ready}>
        {data && pending && <SourceState data={data} error="" retry={result.retry} pollingStopped={result.pollingStopped} loading={result.loading} />}
        {!groups.length && <Empty description="没有符合筛选条件的涨停股票" />}
        {groups.map((group, index) => {
          const expanded = !collapsedThemes.includes(group.name);
          return (
            <section key={group.name} className="theme-review-group" aria-label={group.name}>
              <div className="theme-review-group-heading">
                <div>
                  <h3>{group.name}</h3>
                  <span className="theme-review-count">
                    {group.count}
                    只
                  </span>
                </div>
                <Space className="theme-review-group-stats" size={16} wrap>
                  {group.maxHeight > 1 && <span className="theme-review-height">{`最高${group.maxHeight}板`}</span>}
                  <span>{`成交额 ${scaledNumber(group.amount, 100000000)} 亿`}</span>
                  <InteractionButton
                    intent="expand"
                    expanded={expanded}
                    aria-label={`${expanded ? '收起' : '展开'}${group.name}股票`}
                    aria-controls={`${groupId}-${index}`}
                    onClick={() => setCollapsedThemes((names) => (expanded ? [...names, group.name] : names.filter((name) => name !== group.name)))}
                  >
                    {expanded ? '收起' : '展开'}
                  </InteractionButton>
                </Space>
              </div>
              <div id={`${groupId}-${index}`} hidden={!expanded}>
                {!!group.keywords.length && <p className="theme-review-keywords">{group.keywords.join('、')}</p>}
                <Table<ThemeStock> autoHeight size="small" tableLayout="fixed" rowKey="tsCode" columns={columns} dataSource={group.items} pagination={false} scroll={{ x: 1100 }} />
              </div>
            </section>
          );
        })}
      </DataState>
      {data && !pending && (
      <div className="theme-review-board-source">
        <span>题材与解析来源：同花顺热点复盘</span>
        <SourceState data={data} error="" retry={result.retry} pollingStopped={result.pollingStopped} loading={result.loading} />
      </div>
      )}
      <ThemeDetailPanel key={stock?.tsCode || 'closed'} stock={stock} close={() => setStock(null)} />
    </div>
  );
}
