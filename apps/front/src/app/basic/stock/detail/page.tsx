'use client';

import Link, { InteractionButton, ExternalLink } from '@/components/Interaction';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import NextLink from 'next/link';
import dynamic from 'next/dynamic';
import {
  Alert, Button, Card, DatePicker, Descriptions, Empty, Modal, Skeleton, Space, Tag,
} from 'antd';
import dayjs from 'dayjs';
import Loading from '@/components/Loading';
import Table from '@/components/DataTable';
import { sectorHref } from '@/components/SectorLinks';
import type { SectorLink } from '@/api/sectors';
import { useAccount } from '@/auth/Boundary';
import { allowedPath } from '@/auth/client';
import { trendDefaults } from '@/app/strategy/strategy-options';
import { useDefaultTradeDate } from '@/hooks/useDefaultTradeDate';
import { numberText, scaledNumber } from '@/utils/format';
import { BasicShell, useWorkbench } from '../../components/workbench';
import { sourcePending, WorkbenchSource } from '../../components/workbench-polling';
import { profileDate, profileDateHref, websiteHref } from './profile-display';
import './profile.css';

const StockChart = dynamic(() => import('@/app/strategy/StockChart'), { loading: () => <Loading height={120} />, ssr: false });
const RiskDetails = dynamic(() => import('../../components/RiskInspect').then((module) => module.RiskDetails), { loading: () => <Loading height={180} />, ssr: false });

function SourceNote({ sources = [], stopped, retry }: { sources?: WorkbenchSource[]; stopped: boolean; retry: () => void }) {
  const failed = sources.some((source) => source.state === 'error' || source.message);
  const pending = sources.some(sourcePending);
  const stale = sources.some((source) => source.state === 'stale');
  const dates = sources.map((source) => source.fetchedAt).filter(Boolean).sort();
  let text = '数据来源：Tushare';
  if (dates.length) text += ` · 更新于 ${dayjs(dates[0]).format('YYYY-MM-DD HH:mm')}`;
  if (stale && pending && !stopped) text += ' · 正在更新，当前展示上次取得的资料';
  if (failed) text += ' · 部分资料暂时无法获取，已取得的内容仍可查看';
  if (pending && stopped && !failed) text += ' · 加载时间较长，可稍后重试';
  return (
    <div className="profile-source-note">
      {text}
      {(failed || (stopped && pending)) && <Button size="small" type="default" onClick={retry}>重新加载</Button>}
    </div>
  );
}

function SectorGroup({
  label, links = [], date, limit,
}: { label: string; links?: SectorLink[]; date: string; limit: number }) {
  const [expanded, setExpanded] = useState(false);
  const { user } = useAccount();
  return (
    <div className="profile-sector-row">
      <span className="profile-field-label">{label}</span>
      <div className="profile-sector-tags">
        {!links.length && <span className="profile-muted">暂无分类资料</span>}
        {(expanded ? links : links.slice(0, limit)).map((sector) => (
          <Tag key={sector.code}>{allowedPath(user, '/analysis/sectors') ? <Link href={sectorHref(sector, date)}>{sector.name}</Link> : sector.name}</Tag>
        ))}
        {links.length > limit && <InteractionButton intent="expand" expanded={expanded} size="small" onClick={() => setExpanded(!expanded)}>{expanded ? '收起' : `展开全部 ${links.length} 项`}</InteractionButton>}
      </div>
    </div>
  );
}

function FinancialSummary({ code, date }: { code: string; date: string }) {
  const state = useWorkbench('profile', { code, date, section: 'financial' }, !!date);
  const financial = state.data?.financial;
  const sources: WorkbenchSource[] = state.data?.sources || [];
  const indicatorPending = !state.data || sourcePending(sources.find((s) => s.source === 'fina_indicator'));
  const cashPending = !state.data || sourcePending(sources.find((s) => s.source === 'cashflow'));
  const values = [
    { label: '营业收入同比', value: `${numberText(financial?.or_yoy)}%`, pending: indicatorPending },
    { label: '归母净利润同比', value: `${numberText(financial?.netprofit_yoy)}%`, pending: indicatorPending },
    {
      label: '扣非净利润', unit: '亿元', value: scaledNumber(financial?.profit_dedt, 100000000), pending: indicatorPending,
    },
    {
      label: '经营现金流净额', unit: '亿元', value: scaledNumber(state.data?.cashflow?.n_cashflow_act, 100000000), pending: cashPending || indicatorPending,
    },
    { label: '资产负债率', value: `${numberText(financial?.debt_to_assets)}%`, pending: indicatorPending },
  ];
  return (
    <Card title="财务摘要" extra={<span className="profile-muted">{date ? `截至 ${date} 已披露` : '正在确定观察日期'}</span>}>
      {state.error && <Alert className="mb-16" type="error" message="财务资料加载失败" description={state.error} action={<Button onClick={state.retry}>重试</Button>} />}
      {financial && (
      <p className="profile-report-period">
        报告期：
        {dayjs(financial.end_date).format('YYYY-MM-DD')}
        <span>
          公告日：
          {dayjs(financial.ann_date).format('YYYY-MM-DD')}
        </span>
      </p>
      )}
      {!financial && state.data && !indicatorPending && <p className="profile-muted">{sources.some((s) => s.source === 'fina_indicator' && s.state === 'error') ? '财务指标暂时无法获取' : '暂无截至观察日期已披露的财务指标'}</p>}
      <div className="profile-stats" aria-label="财务指标">
        {values.map(({
          label, unit, value, pending,
        }) => (
          <div className="profile-stat" key={label}>
            <span>
              {label}
              {unit && (
              <small>
                （
                {unit}
                ）
              </small>
              )}
            </span>
            {pending && String(value).startsWith('—') && !state.error && !state.pollingStopped ? <Skeleton.Input active size="small" aria-label={`${label}加载中`} /> : <strong>{String(value).replace('—%', '—')}</strong>}
          </div>
        ))}
      </div>
      <p className="profile-muted">利润及现金流为报告期累计值，现金流与财务指标采用同一报告期；“—”表示未取得数据。</p>
      {!!state.data && <SourceNote sources={sources} stopped={state.pollingStopped} retry={state.retry} />}
    </Card>
  );
}

function Profile() {
  const params = useSearchParams();
  const router = useRouter();
  const code = params.get('code') || '';
  const validCode = /^\d{6}\.(SH|SZ|BJ)$/.test(code);
  const selected = profileDate(params.get('date'));
  const fallback = useDefaultTradeDate(validCode && !selected);
  const date = selected || (fallback.ready ? fallback.tradeDate : '');
  const state = useWorkbench('profile', { code, date, section: 'overview' }, validCode && !!date);
  const [chart, setChart] = useState(false);
  const [risk, setRisk] = useState(false);
  const { user } = useAccount();
  const d = state.data;
  const stock = d?.stock;
  const company = d?.company;
  const linkedCode = d?.code || code;
  const companyPending = !company && !state.error && !state.pollingStopped && sourcePending(d?.sources?.find((s: WorkbenchSource) => s.source === 'stock_company'));
  const sectorDates = Array.from(new Set<string>([...(stock?.industries || []), ...(stock?.topics || [])].map((s: SectorLink) => (s.asOf || '').slice(0, 10)).filter(Boolean)));
  const website = websiteHref(company?.website);
  const websiteValue = website ? <ExternalLink href={website} target="_blank" rel="noreferrer">{company.website}</ExternalLink> : company?.website || '—';
  const routes = [
    { label: '每日行情', path: '/basic/daily', query: `tsCode=${linkedCode}&date=${date}` },
    { label: '龙虎榜', path: '/analysis/dragon', query: `code=${linkedCode}&date=${date}` },
    { label: '策略信号', path: '/strategy', query: `code=${linkedCode}&date=${date}` },
    { label: '同花顺人气', path: '/analysis/senti', query: `view=popularity&scope=all&code=${linkedCode}&date=${date}` },
  ];
  return (
    <BasicShell path="/basic/stock">
      <div className="stock-profile">
        <div className="profile-breadcrumb">
          <NextLink href="/basic/stock/">个股基本信息</NextLink>
          <span>/</span>
          <span>个股档案</span>
        </div>
        {!validCode ? <Empty description={code ? '股票代码无效，请从列表重新选择' : '请从股票列表选择个股'} /> : (
          <>
            <header className="profile-header">
              <div>
                <div className="profile-title-row">
                  {(stock || state.error || fallback.error) ? <h1>{stock?.name || '个股档案'}</h1> : <Skeleton.Input active aria-label="股票名称加载中" />}
                  <span className="profile-code">{linkedCode}</span>
                  {stock?.listStatus && <Tag>{({ L: '当前上市', D: '当前退市', P: '当前暂停上市' } as Record<string, string>)[stock.listStatus] || '上市状态未提供'}</Tag>}
                </div>
                <p className="profile-muted">公司资料与上市状态采用最近取得的信息；观察日期用于财务披露筛选及相关行情、事件查询。</p>
              </div>
              <div className="profile-date">
                <span id="profile-date-label">观察日期</span>
                <DatePicker id="profile-observation-date" aria-label="观察日期" value={date ? dayjs(date) : null} allowClear={false} disabledDate={(v) => v.format('YYYY-MM-DD') > dayjs().format('YYYY-MM-DD')} onChange={(v) => { if (v) router.replace(profileDateHref(params.toString(), v.format('YYYY-MM-DD')), { scroll: false }); }} />
              </div>
            </header>
            {!selected && fallback.error && <Alert className="mb-16" type="error" message="观察日期加载失败" description="可重试或直接选择日期。" action={<Button onClick={fallback.retry}>重试</Button>} />}
            {state.error && <Alert className="mb-16" type="error" message="公司资料加载失败" description={state.error} action={<Button loading={state.loading} onClick={state.retry}>重试</Button>} />}
            {stock && (
              <nav className="profile-actions" aria-label="个股相关功能">
                <InteractionButton intent="preview" onClick={() => setChart(true)}>查看 K 线</InteractionButton>
                <Space wrap size={[16, 8]}>{routes.filter((route) => allowedPath(user, route.path)).map((route) => <Link key={route.path} href={`${route.path}/?${route.query}`}>{route.label}</Link>)}</Space>
                <div className="profile-actions-secondary">
                  {allowedPath(user, '/basic/stock/risk') && <Link href={`/basic/stock/risk/?code=${linkedCode}&date=${date}`}>交易状态</Link>}
                  <InteractionButton intent="preview" onClick={() => setRisk(true)}>公告与财务风险核验</InteractionButton>
                  {allowedPath(user, '/basic/trade-cal') && <Link href={`/basic/trade-cal/?code=${linkedCode}&date=${date}`}>相关事件</Link>}
                </div>
              </nav>
            )}
            {!stock && !state.error && !fallback.error && (state.loading || !date) && <Card title="公司资料"><Skeleton active paragraph={{ rows: 6 }} /></Card>}
            {!stock && d && !state.error && <Empty description="未找到该股票的公司资料" />}
            {stock && (
              <>
                <Card title="公司资料" extra={<Tag>最近资料</Tag>}>
                  <p className="profile-muted profile-basis">
                    基本资料更新：
                    {d.profileAsOf || '未提供更新日期'}
                    。以下内容不随观察日期还原历史。
                  </p>
                  <Descriptions
                    column={{ xs: 1, md: 2, xl: 3 }}
                    items={[
                      {
                        key: 'full', label: '公司名称', children: company?.com_name || stock.fullname || '—', span: 3,
                      },
                      { key: 'controller', label: '实际控制人', children: stock.actName || '—' },
                      { key: 'type', label: '实控人性质', children: stock.actEntType || '—' },
                      { key: 'market', label: '上市板块', children: stock.market || '—' },
                      { key: 'list', label: '上市日期', children: stock.listDate || '—' },
                      ...(stock.delistDate ? [{ key: 'delist', label: '退市日期', children: stock.delistDate }] : []),
                      { key: 'chair', label: '董事长', children: companyPending ? <Skeleton.Input active size="small" /> : company?.chairman || '—' },
                      { key: 'site', label: '公司网站', children: companyPending ? <Skeleton.Input active size="small" /> : websiteValue },
                    ]}
                  />
                  <section className="profile-business">
                    <h2>主营业务</h2>
                    {companyPending ? <Skeleton active title={false} paragraph={{ rows: 2 }} /> : <p>{company?.main_business || '暂无主营业务资料'}</p>}
                  </section>
                  <details className="profile-disclosure">
                    <summary>公司简介</summary>
                    {companyPending ? <Skeleton active title={false} paragraph={{ rows: 3 }} /> : <p className="profile-company-text">{company?.introduction || '暂无公司简介'}</p>}
                  </details>
                  <SourceNote sources={d.sources} stopped={state.pollingStopped} retry={state.retry} />
                </Card>
                <Card title="所属行业与所属概念" className="profile-sectors">
                  <SectorGroup key={`${linkedCode}-industry`} label="所属行业" links={stock.industries} date={date} limit={3} />
                  <SectorGroup key={`${linkedCode}-topics`} label="所属概念" links={stock.topics} date={date} limit={8} />
                  {!!sectorDates.length && (
                  <p className="profile-muted">
                    成分资料日期：
                    {sectorDates.join('、')}
                    {sectorDates.some((v) => v > date) ? '。该资料晚于观察日期，仅供当前归属参考。' : '。按观察日期可用的最近快照展示。'}
                  </p>
                  )}
                </Card>
              </>
            )}
            {(date || !fallback.error) && <FinancialSummary code={code} date={date} />}
            {stock && (
              <Card title="名称与代码记录">
                <details className="profile-disclosure">
                  <summary>
                    历史名称（
                    {d.names?.length || 0}
                    {' '}
                    条）
                  </summary>
                  <Table rowKey={(r: any) => `${r.tsCode}-${r.startDate}-${r.name}`} dataSource={d.names || []} pagination={false} scroll={{ x: 560 }} locale={{ emptyText: '暂无历史名称记录' }} columns={[{ title: '名称', dataIndex: 'name' }, { title: '代码', dataIndex: 'tsCode' }, { title: '开始日期', dataIndex: 'startDate' }, { title: '结束日期', dataIndex: 'endDate', render: (v) => v || '未提供' }]} />
                </details>
                <p className="profile-code-history">
                  当前代码：
                  {linkedCode}
                </p>
                {(d.aliases || []).some((alias: string) => alias !== linkedCode) && (
                <p className="profile-muted">
                  历史代码：
                  {d.aliases.filter((alias: string) => alias !== linkedCode).join('、')}
                  。代码变更日期未提供。
                </p>
                )}
              </Card>
            )}
            {chart && stock && <StockChart key={`${linkedCode}-${date}`} neutral stock={stock} date={date} strategy="fiveMaUp" options={trendDefaults} onClose={() => setChart(false)} />}
            <Modal open={risk} title={`${stock?.name || linkedCode} · 公告与财务风险核验`} onCancel={() => setRisk(false)} footer={null} width={960} destroyOnClose>{risk && <RiskDetails code={linkedCode} date={date} />}</Modal>
          </>
        )}
      </div>
    </BasicShell>
  );
}

export default function Page() { return <Suspense fallback={<Loading />}><Profile /></Suspense>; }
