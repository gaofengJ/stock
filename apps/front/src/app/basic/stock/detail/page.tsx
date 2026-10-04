/* eslint-disable no-nested-ternary */

'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Button, Card, DatePicker, Descriptions, Empty, Space, Tabs, Tag,
} from 'antd';
import dayjs from 'dayjs';
import Loading from '@/components/Loading';
import Table from '@/components/DataTable';
import SectorLinks from '@/components/SectorLinks';
import StockChart from '@/app/strategy/StockChart';
import { trendDefaults } from '@/app/strategy/strategy-options';
import { useDefaultTradeDate } from '@/hooks/useDefaultTradeDate';
import { numberText, scaledNumber } from '@/utils/format';
import { BasicShell, SourceState, useWorkbench } from '../../components/workbench';
import RiskInspect from '../../components/RiskInspect';

function Profile() {
  const params = useSearchParams(); const code = params.get('code') || '';
  const fallback = useDefaultTradeDate(); const [selected, setSelected] = useState(params.get('date') || '');
  const date = selected || (fallback.ready ? fallback.tradeDate : '');
  const state = useWorkbench('profile', { code, date }, !!code && !!date);
  const [chart, setChart] = useState(false);
  const sectorDates = Array.from(new Set<string>([...(state.data?.stock?.industries || []), ...(state.data?.stock?.topics || [])].map((s: any) => String(s.asOf || '').slice(0, 10)).filter(Boolean)));
  const sectorBasis = sectorDates.length ? `成分快照：${sectorDates.join('、')}${sectorDates.some((v) => v > date) ? '（晚于观察日期，仅供当前归属参考）' : ''}` : '暂无可用成分快照';
  const d = state.data; const stock = d?.stock; const company = d?.company; const financial = d?.financial;
  const linkedCode = d?.code || code;
  return (
    <BasicShell title="个股档案" path="/basic/stock">
      <div className="basic-profile-heading">
        <Space wrap>
          <Link href="/basic/stock/">股票目录</Link>
          <strong>{stock?.name || code}</strong>
          <span>{linkedCode}</span>
          <Tag>{({ L: '上市', D: '退市', P: '暂停上市' } as any)[stock?.listStatus] || '状态待核实'}</Tag>
        </Space>
        <Space>
          <span>观察日期</span>
          <DatePicker value={date ? dayjs(date) : null} allowClear={false} onChange={(v) => { if (v) setSelected(v.format('YYYY-MM-DD')); }} />
        </Space>
      </div>
      <SourceState data={state.data} error={state.error} retry={state.retry} />
      {state.loading && !d ? <Loading /> : !stock ? <Empty description={code ? '暂无档案' : '请从股票列表选择个股'} /> : (
        <>
          <Space className="mb-16" size={[16, 12]} wrap>
            <Button onClick={() => setChart(true)}>查看K线</Button>
            <RiskInspect code={linkedCode} date={date} />
            <Link href={`/basic/daily/?tsCode=${linkedCode}&date=${date}`}>每日行情</Link>
            <Link href={`/analysis/dragon/?code=${linkedCode}&date=${date}`}>龙虎榜</Link>
            <Link href={`/strategy/?code=${linkedCode}&date=${date}`}>策略信号</Link>
            <Link href={`/strategy/?view=popularity&code=${linkedCode}&date=${date}`}>同花顺人气</Link>
            <Link href={`/basic/stock/risk/?code=${linkedCode}&date=${date}`}>风险与交易状态</Link>
            <Link href={`/basic/trade-cal/?code=${linkedCode}&date=${date}`}>相关事件</Link>
          </Space>
          <Card size="small" title="行业与题材">
            <Space wrap>
              <SectorLinks stock={stock} date={date} />
              <SectorLinks stock={stock} type="N" date={date} />
            </Space>
            <div className="basic-muted">{sectorBasis}</div>
          </Card>
          <Card
            size="small"
            title="财务摘要"
            extra={(
              <span className="basic-muted">
                截至
                {date}
                {' '}
                已公告
              </span>
)}
          >
            <Space wrap>
              <span>
                报告期
                {financial?.end_date ? dayjs(financial.end_date).format('YYYY-MM-DD') : '—'}
              </span>
              <span>
                公告日
                {financial?.ann_date ? dayjs(financial.ann_date).format('YYYY-MM-DD') : '—'}
              </span>
            </Space>
            <div className="basic-stats">
              {[
                ['营业收入同比', `${numberText(financial?.or_yoy)}%`], ['归母净利润同比', `${numberText(financial?.netprofit_yoy)}%`], ['扣非净利润（亿元）', scaledNumber(financial?.profit_dedt, 100000000)], ['经营现金流净额（亿元）', scaledNumber(d?.cashflow?.n_cashflow_act, 100000000)], ['资产负债率', `${numberText(financial?.debt_to_assets)}%`],
              ].map(([label, value]) => (
                <div className="basic-stat" key={label}>
                  <span>{label}</span>
                  <strong>{String(value).replace('—%', '—')}</strong>
                </div>
              ))}
            </div>
            <span className="basic-muted">利润及现金流为报告期累计值；缺失显示“—”。</span>
          </Card>
          <Tabs items={[{
            key: 'company',
            label: '公司资料',
            children: (
              <Card size="small">
                <p className="basic-muted">
                  最近资料快照
                  {d.profileAsOf || '未知'}
                  ；公司介绍及实控人为当前资料，不作为历史时点资料。
                </p>
                <Descriptions
                  column={{ xs: 1, md: 2, xl: 3 }}
                  items={[
                    { key: 'full', label: '公司名称', children: company?.com_name || stock.fullname || '—' },
                    { key: 'controller', label: '实控人', children: stock.actName || '未提供' },
                    { key: 'type', label: '实控人性质', children: stock.actEntType || '未提供' },
                    { key: 'market', label: '市场', children: stock.market || '—' },
                    { key: 'list', label: '上市日期', children: stock.listDate || '—' },
                    { key: 'delist', label: '退市日期', children: stock.delistDate || '—' },
                    { key: 'chair', label: '董事长', children: company?.chairman || '—' },
                    { key: 'site', label: '公司网站', children: company?.website || '—' },
                    { key: 'aliases', label: '代码沿革', children: d.aliases.join(' / ') },
                  ]}
                />
                <h3>主营业务</h3>
                <p className="basic-company-text">{company?.main_business || '暂无资料'}</p>
                <h3>公司介绍</h3>
                <p className="basic-company-text">{company?.introduction || '暂无资料'}</p>
              </Card>
            ),
          }, { key: 'names', label: '历史名称', children: <Table rowKey={(r: any) => `${r.tsCode}-${r.startDate}-${r.name}`} dataSource={d.names} pagination={false} columns={[{ title: '名称', dataIndex: 'name' }, { title: '代码', dataIndex: 'tsCode' }, { title: '开始日期', dataIndex: 'startDate' }, { title: '结束日期', dataIndex: 'endDate', render: (v) => v || '未提供' }]} /> }]}
          />
          <StockChart neutral stock={chart ? stock : null} date={date} strategy="fiveMaUp" options={trendDefaults} onClose={() => setChart(false)} />
        </>
      )}
    </BasicShell>
  );
}
export default function Page() { return <Suspense fallback={<Loading />}><Profile /></Suspense>; }
