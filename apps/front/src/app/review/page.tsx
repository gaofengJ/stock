'use client';

/* eslint jsx-a11y/label-has-associated-control: ["error", { "assert": "htmlFor" }] */

import { useEffect, useState } from 'react';
import {
  Alert, Button, Card, Checkbox, Collapse, DatePicker, Input, Modal, Select, Space, Tag, Tooltip,
} from 'antd';
import dayjs from 'dayjs';
import Layout from '@/components/Layout';
import { InteractionButton } from '@/components/Interaction';
import { EHeaderMenuKey } from '@/components/Layout/enum';
import Table from '@/components/DataTable';
import request from '@/api/request';
import { errorMessage } from '@/api/errors';
import { useAccount } from '@/auth/Boundary';
import { useDefaultTradeDate } from '@/hooks/useDefaultTradeDate';
import { numberText, scaledNumber, beijingTime } from '@/utils/format';
import StockChart from '../strategy/StockChart';
import { trendDefaults } from '../strategy/strategy-options';
import CandidateEnvironment from '../strategy/CandidateEnvironment';
import RiskInspect from '../basic/components/RiskInspect';
import { RiskTags, SourceState, useWorkbench } from '../basic/components/workbench';
import { currentReduction } from '../basic/components/risk-display';
import Holdings from './Holdings';
import useReviewDraft from './useReviewDraft';
import { compareCap, validDate } from './review-interactions';
import '../strategy/strategy.sass';
import './review.css';

function Report({ date, account }: { date: string; account: number }) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [filter, setFilter] = useState('within');
  const [keyword, setKeyword] = useState('');
  const [stock, setStock] = useState<any>(null);
  const [strategy, setStrategy] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortOrder, setSortOrder] = useState<string | null>('ascend');
  const [scrollContainer, setScrollContainer] = useState<HTMLElement>();
  const [holdingsResult, setHoldingsResult] = useState<any>(null);
  const [exported, setExported] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  useEffect(() => { setScrollContainer(document.querySelector<HTMLElement>('.platform-content') || undefined); }, []);
  useEffect(() => { setPage(1); }, [filter, keyword, strategy]);
  const {
    draft, update, ready, status,
  } = useReviewDraft(account, date);
  const risk = useWorkbench('risk', { date }, !!data);
  useEffect(() => {
    const abort = new AbortController(); let active = true;
    setLoading(true); setError('');
    request.get('/review/report', {
      params: { date }, timeout: 190000, signal: abort.signal, autoShowError: false,
    })
      .then((r) => { if (active) setData(r.data); })
      .catch((e) => { if (active) setError(errorMessage(e, '候选加载失败，请重试')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; abort.abort(); };
  }, [date, attempt]);
  const blocked = (row: any) => row.risk?.state === 'excluded' || risk.data?.items?.some((r: any) => r.tsCode === row.tsCode && (['ST', '停牌'].includes(r.type) || currentReduction(r, date)));
  const rows: any[] = data?.items || [];
  const eligible = rows.filter((r) => r.capState === 'within' && !blocked(r));
  const excludedCount = rows.filter(blocked).length;
  const capCount = rows.filter((r) => !blocked(r) && r.capState !== 'within').length;
  const selected = draft.selected.map((r) => r.tsCode);
  const chosen = draft.selected.map((pick) => ({ ...pick, row: rows.find((r) => r.tsCode === pick.tsCode) }));
  const filtered = rows.filter((r) => (!keyword.trim() || `${r.tsCode} ${r.name}`.toLowerCase().includes(keyword.trim().toLowerCase()))
    && (strategy === 'all' || r.strategies.some((s: any) => s.key === strategy))
    && (filter === 'all' || (filter === 'within' && r.capState === 'within' && !blocked(r)) || (filter === 'excluded' && blocked(r)) || (filter === 'missing' && r.capState === 'missing')));
  const lastPage = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, lastPage);
  useEffect(() => { setPage((value) => Math.min(value, lastPage)); }, [lastPage]);
  const selectionReason = (row: any) => {
    if (!ready) return '正在读取草稿';
    if (selected.includes(row.tsCode)) return '';
    if (loading) return '候选更新中，请稍候';
    if (blocked(row)) return '已知风险事项排除，不能加入观察名单';
    if (row.capState !== 'within') return '总市值需小于200亿元且资料完整';
    if (selected.length >= 3) return '最多选择3只，请先移出一只';
    return '';
  };
  const remove = (code: string) => update({ selected: draft.selected.filter((r) => r.tsCode !== code) });
  const goToStep = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ block: 'start' });
    document.getElementById(`${id}-title`)?.focus({ preventScroll: true });
  };
  const plan = (code?: string) => {
    goToStep('review-plan');
    const target = code || selected[0];
    const field = document.getElementById(target ? `review-note-${target}` : 'review-focus');
    field?.scrollIntoView({ block: 'nearest' });
    field?.focus({ preventScroll: true });
  };
  const candidatesTop = () => document.getElementById('review-candidates-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const riskLabel = (row: any) => {
    if (!row) return data ? '本次候选未包含，请重新确认' : '候选资料尚未取得';
    if (blocked(row)) return '已知风险事项，请移出名单';
    if (row.capState !== 'within') return '市值条件不符，请重新确认';
    return '风险资料待核验';
  };
  let sortCaption = '当前使用候选原始顺序';
  if (sortOrder === 'ascend') sortCaption = '当前按流通市值从小到大排列';
  if (sortOrder === 'descend') sortCaption = '当前按流通市值从大到小排列';
  const download = () => {
    const text = [
      `# ${date} 每日复盘与下一交易日计划`,
      `候选生成时间：${data?.generatedAt ? beijingTime(data.generatedAt) : '尚未取得'}；导出时间：${beijingTime(new Date().toISOString())}。`,
      '候选范围：全部策略默认参数，合并重复股票；总市值小于200亿元，默认按流通市值从小到大排列。',
      '## 观察名单',
      ...(chosen.length ? chosen.map(({ name, tsCode, row }) => `- ${row?.name || name} ${tsCode}：${row?.strategies?.map((s: any) => s.label).join('、') || '候选资料待确认'}；${riskLabel(row)}。\n  看图与观察条件：${draft.notes[tsCode] || '待填写'}\n  人工风险核验记录：${draft.riskNotes[tsCode] || '未记录'}`) : ['本次未选观察股票。']),
      `## 下一交易日计划\n重点观察：${draft.focus || '待填写'}\n放弃／退出条件：${draft.exit || '待填写'}\n新机会与持仓比较：${draft.reason || '未填写'}`,
      ...(holdingsResult ? ['## 本次持仓分析', ...holdingsResult.items.map((r: any) => `- ${r.name} ${r.code}：持有 ${r.heldDays ?? '未知'} 个交易日；收盘 ${numberText(r.close)} 元；成本价格差 ${numberText(r.profitPct)}%；${r.ma5.label}，MA5 ${numberText(r.ma5.ma5)}。\n  ${r.timeReview}\n  原买入理由：${r.rationale || '未输入'}`), holdingsResult.note || ''] : []),
      '## 数据与核验说明\n人工记录仅为本次复盘笔记；风险资料状态单独列示。请结合公告原文记录减持、重大利空及财务审计等事项的核验结论与时间。',
      `数据说明：${data?.riskNote || '候选资料尚未取得。'} 历史日期按当前可用资料回看。`,
    ].join('\n\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `每日复盘-${date}.md`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setExported(true);
  };
  return (
    <>
      <div className="review-toolbar">
        <span role="status" className="review-caption">
          {status}
          {' '}
          · 按账号和交易日期分别保存
        </span>
        <Space wrap>
          <Button onClick={() => setHelpOpen(true)}>页面说明</Button>
          <Button loading={loading} onClick={() => setAttempt((v) => v + 1)}>更新候选数据</Button>
        </Space>
      </div>
      <div className="review-steps" aria-label="复盘操作流程">
        {[
          ['review-market', '看市场背景', '查看涨跌、均线与成交情况'],
          ['review-candidates', '筛选观察股票', '看K线和风险资料，选择0–3只股票'],
          ['review-plan', '填写并导出计划', '核验名单，记录下一交易日计划'],
        ].map(([id, title, description], i) => (
          <button type="button" className="review-step" key={id} aria-label={`第${i + 1}步：${title}`} aria-controls={id} onClick={() => goToStep(id)}>
            <span className="review-step-number">{i + 1}</span>
            <div>
              <strong>{title}</strong>
              <span className="review-caption">{description}</span>
            </div>
          </button>
        ))}
      </div>
      <section id="review-market" className="review-market" aria-labelledby="review-market-title">
        <div className="review-section-heading">
          <h2 id="review-market-title" tabIndex={-1} className="review-step-title">
            <span className="review-step-number">1</span>
            看市场背景
          </h2>
        </div>
        <CandidateEnvironment date={date} />
      </section>
      <div className="review-workspace">
        <section id="review-candidates" className="review-candidates" aria-labelledby="review-candidates-title">
          <div className="review-section-heading">
            <h2 id="review-candidates-title" tabIndex={-1} className="review-step-title">
              <span className="review-step-number">2</span>
              筛选观察股票
            </h2>
          </div>
          {error && <Alert className="review-candidate-notice" type="error" showIcon message={error} description={data ? '当前仍展示上次取得的候选；观察名单和草稿已保留。' : '可以继续填写计划并导出草稿。'} action={<Button onClick={() => setAttempt((v) => v + 1)}>重试</Button>} />}
          {data && !data.complete && <Alert className="review-candidate-notice" type="warning" showIcon message="部分策略未取得结果，候选范围不完整" description="可继续记录计划，稍后点击“更新候选数据”重试。" />}
          <div className="review-counts">
            <span>{`策略命中（去重） ${data ? rows.length : '—'} 只`}</span>
            <strong>{`可加入观察 ${data ? eligible.length : '—'} 只`}</strong>
            <span>{`已知风险排除 ${data ? excludedCount : '—'} 只`}</span>
            <span>{`市值不符或缺失 ${data ? capCount : '—'} 只`}</span>
          </div>
          <div className="review-candidate-help">
            <p className="review-caption">
              查看K线和风险资料后，勾选0–3只股票。
              {sortCaption}
              。
            </p>
          </div>
          <div className="review-filters">
            <Select aria-label="候选范围" value={filter} onChange={setFilter} options={[{ value: 'within', label: '可加入观察的股票' }, { value: 'all', label: '全部策略命中' }, { value: 'excluded', label: '已知风险排除' }, { value: 'missing', label: '市值资料缺失' }]} />
            <Input allowClear aria-label="搜索候选股票" placeholder="输入股票名称或代码" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
            <Select aria-label="筛选策略" value={strategy} onChange={setStrategy} options={[{ value: 'all', label: '全部策略' }, ...(data?.strategies || []).map((s: any) => ({ value: s.key, label: s.label, disabled: s.state !== 'ready' }))]} />
            <Button disabled={filter === 'within' && strategy === 'all' && !keyword} onClick={() => { setFilter('within'); setStrategy('all'); setKeyword(''); }}>重置筛选</Button>
          </div>
          <div className="review-selection" role="status">
            <span>{`已选 ${selected.length}/3${selected.length === 3 ? ' · 已达上限，请移出后再选择' : ' · 勾选可加入观察的股票'}`}</span>
            {chosen.map(({ name, tsCode }) => <Tag key={tsCode}>{name}</Tag>)}
          </div>
          <div id="review-candidate-table">
            <Table
              loading={loading}
              rowKey="tsCode"
              dataSource={filtered}
              rowClassName={(r: any) => (selected.includes(r.tsCode) ? 'interaction-selected-row' : '')}
              autoHeight
              sticky={scrollContainer ? { getContainer: () => scrollContainer, offsetHeader: 0 } : false}
              onChange={(pagination, _filters, sorter, extra) => {
                setPage(extra.action === 'paginate' ? pagination.current || 1 : 1);
                setPageSize(pagination.pageSize || 10);
                if (extra.action === 'paginate') candidatesTop();
                if (extra.action === 'sort') setSortOrder((Array.isArray(sorter) ? sorter[0] : sorter)?.order || null);
              }}
              pagination={{
                current: currentPage, pageSize, showSizeChanger: true, pageSizeOptions: [10, 20, 50], showTotal: (total) => `当前范围 ${total} 只`,
              }}
              scroll={{ x: 850 }}
              locale={{ emptyText: error ? '候选数据未取得，请重试' : '当前范围没有股票，可调整筛选条件或保持空名单' }}
              columns={[
                {
                  title: '加入', key: 'select', width: 60, render: (_, r: any) => <Tooltip title={selectionReason(r) || (selected.includes(r.tsCode) ? '移出观察名单' : '加入观察名单')}><span><Checkbox aria-label={`选择${r.name}`} checked={selected.includes(r.tsCode)} disabled={!!selectionReason(r)} onChange={(e) => (e.target.checked ? update({ selected: [...draft.selected, { tsCode: r.tsCode, name: r.name }] }) : remove(r.tsCode))} /></span></Tooltip>,
                },
                {
                  title: '股票与操作',
                  key: 'stock',
                  width: 175,
                  render: (_, r: any) => (
                    <div>
                      <span className="review-stock-name">{r.name}</span>
                      <span className="review-caption">{r.tsCode}</span>
                      <div className="review-stock-actions">
                        <InteractionButton intent="preview" onClick={() => setStock(r)}>看K线</InteractionButton>
                        <RiskInspect code={r.tsCode} name={r.name} date={date} />
                      </div>
                    </div>
                  ),
                },
                {
                  title: '入选线索', key: 'signals', width: 200, render: (_, r: any) => r.strategies.map((s: any) => <Tag key={s.key}>{s.label}</Tag>),
                },
                {
                  title: '收盘价／元', dataIndex: 'close', width: 100, align: 'right', render: (v) => numberText(v),
                },
                {
                  title: '总市值／亿', dataIndex: 'totalMv', width: 105, align: 'right', render: (v) => scaledNumber(v, 10000),
                },
                {
                  title: '流通市值／亿', dataIndex: 'circMv', width: 115, align: 'right', sorter: (a: any, b: any) => compareCap(a.circMv, b.circMv), defaultSortOrder: 'ascend', render: (v) => scaledNumber(v, 10000),
                },
                {
                  title: '风险资料状态',
                  key: 'risk',
                  width: 180,
                  render: (_, r: any) => (
                    <>
                      <Tag color={blocked(r) ? 'red' : 'orange'}>{blocked(r) ? '已知风险排除' : '待核验'}</Tag>
                      <RiskTags data={risk.data} code={r.tsCode} date={date} />
                    </>
                  ),
                },
              ]}
            />
          </div>
          <div className="review-candidate-next">
            <span className="review-caption">{`已选 ${selected.length}/3 只${selected.length ? '' : ' · 也可只记录市场计划'}`}</span>
            <Button type="primary" onClick={() => plan()}>下一步：填写计划</Button>
          </div>
        </section>
        <section className="review-plan" id="review-plan" aria-labelledby="review-plan-title">
          <Card
            title={(
              <div className="review-plan-title">
                <h2 id="review-plan-title" tabIndex={-1} className="review-step-title">
                  <span className="review-step-number">3</span>
                  填写并导出计划
                </h2>
                <span className="review-caption">{`${selected.length}/3只`}</span>
              </div>
            )}
          >
            <div className="review-plan-content">
              <p className="review-caption">为选中的股票记录观察条件，再整理下一交易日计划。</p>
              {!chosen.length && (
              <div className="review-empty">
                还没有选观察股票。
                <br />
                在候选表勾选股票后，会在这里出现；也可只填写市场计划，保持空名单。
              </div>
              )}
              <div className="review-picks" data-count={chosen.length}>
                {chosen.map(({ name, tsCode, row }) => (
                  <div key={tsCode} className="review-pick">
                    <div className="review-pick-summary">
                      <div className="review-pick-heading">
                        <strong>{row?.name || name}</strong>
                        <Button size="small" aria-label={`将${name}移出观察名单`} onClick={() => remove(tsCode)}>移出</Button>
                      </div>
                      <span className="review-caption">{tsCode}</span>
                      <div className="review-stock-actions">
                        {row && <InteractionButton intent="preview" onClick={() => setStock(row)}>看K线</InteractionButton>}
                        <RiskInspect code={tsCode} name={name} date={date} />
                      </div>
                    </div>
                    <div className="review-risk-state">
                      <Tag color={row && blocked(row) ? 'red' : 'orange'}>{riskLabel(row)}</Tag>
                    </div>
                    <div className="review-pick-fields">
                      <label className="review-field" htmlFor={`review-note-${tsCode}`}>
                        <span>观察理由与触发条件</span>
                        <Input.TextArea id={`review-note-${tsCode}`} aria-label={`${name}看图与计划`} disabled={!ready} value={draft.notes[tsCode] || ''} maxLength={2000} rows={3} placeholder="例如：观察回踩支撑后的走势；记录支撑位、观察条件及放弃条件" onChange={(e) => update({ notes: { ...draft.notes, [tsCode]: e.target.value } })} />
                      </label>
                      <label className="review-field" htmlFor={`review-risk-${tsCode}`}>
                        <span>人工风险核验记录</span>
                        <Input.TextArea id={`review-risk-${tsCode}`} aria-label={`${name}风险核验记录`} disabled={!ready} value={draft.riskNotes[tsCode] || ''} maxLength={2000} rows={3} placeholder="查看风险资料后，记录公告原文、核验结论与时间；缺失事项也请记录" onChange={(e) => update({ riskNotes: { ...draft.riskNotes, [tsCode]: e.target.value } })} />
                      </label>
                    </div>
                    {draft.riskNotes[tsCode]?.trim() && <span className="review-caption">已填写人工记录，系统风险资料状态仍单独显示。</span>}
                  </div>
                ))}
              </div>
              <Collapse
                className="review-details"
                items={[{
                  key: 'holdings',
                  label: '分析已有持仓（可选）',
                  forceRender: true,
                  children: <Holdings date={date} candidates={chosen.map((r) => `${r.name} ${r.tsCode}`)} onResult={setHoldingsResult} />,
                }]}
              />
              <div className="review-day-plan">
                <h3>下一交易日计划</h3>
                <div className="review-day-fields">
                  <label className="review-field" htmlFor="review-focus">
                    <span>下一交易日重点观察</span>
                    <Input.TextArea id="review-focus" aria-label="下一交易日重点观察" disabled={!ready} value={draft.focus} onChange={(e) => update({ focus: e.target.value })} maxLength={2000} rows={3} placeholder="例如：关注哪些方向、市场量能和候选走势" />
                  </label>
                  <label className="review-field" htmlFor="review-exit">
                    <span>放弃或退出条件</span>
                    <Input.TextArea id="review-exit" aria-label="放弃或退出条件" disabled={!ready} value={draft.exit} onChange={(e) => update({ exit: e.target.value })} maxLength={2000} rows={3} placeholder="例如：走势未兑现、出现新风险时如何处理" />
                  </label>
                  <label className="review-field" htmlFor="review-reason">
                    <span>新机会与持仓比较（可选）</span>
                    <Input.TextArea id="review-reason" aria-label="新机会理由" disabled={!ready} value={draft.reason} onChange={(e) => update({ reason: e.target.value })} maxLength={2000} rows={3} placeholder="比较走势、风险和原持仓理由，记录是否调整观察计划" />
                  </label>
                </div>
              </div>
            </div>
            <div className="review-plan-footer">
              <div className="review-plan-actions">
                <Button type="primary" disabled={!ready} onClick={download}>导出复盘与计划</Button>
                <span className="review-caption">Markdown 文件</span>
              </div>
              <p role="status" className="review-caption">
                {exported ? '已导出，请查看浏览器下载。' : ''}
                {status}
              </p>
            </div>
          </Card>
        </section>
      </div>
      <Modal title="复盘说明" open={helpOpen} onCancel={() => setHelpOpen(false)} footer={<Button onClick={() => setHelpOpen(false)}>知道了</Button>}>
        <div className="review-help-content">
          <p>候选使用全部策略默认参数，合并重复股票。观察名单最多3只，限定总市值小于200亿元，排除已知ST、停牌和进行中的已核实减持计划。</p>
          <p>行情截至所选交易日收盘，公告按当日已披露信息筛选。历史日期使用当前可用资料回看；人工核验记录不会改变系统风险资料状态。</p>
          <p>草稿按账号和交易日期保存在当前浏览器。刷新或切换日期可恢复；更换浏览器或设备时，请使用导出文件。</p>
          <p>策略命中数量可能重叠，可使用候选表上方的策略筛选。</p>
          <Space wrap>{data?.strategies.map((s: any) => <Tag key={s.key}>{`${s.label}：${s.count ?? '暂不可用'}`}</Tag>)}</Space>
          <SourceState data={risk.data || data} error={risk.error} loading={risk.loading} pollingStopped={risk.pollingStopped} retry={risk.retry} />
        </div>
      </Modal>
      <StockChart stock={stock} date={date} strategy={stock?.strategies?.[0]?.key || 'fiveMaUp'} options={trendDefaults} onClose={() => setStock(null)} />
    </>
  );
}

export default function Page() {
  const fallback = useDefaultTradeDate();
  const { user } = useAccount();
  const [chosenDate, setChosenDate] = useState('');
  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get('date') || '';
    if (validDate(value)) setChosenDate(value);
  }, []);
  const changeDate = (value: string) => {
    setChosenDate(value);
    const url = new URL(window.location.href); url.searchParams.set('date', value);
    window.history.replaceState(null, '', url);
  };
  const date = chosenDate || (fallback.ready ? fallback.tradeDate : '');
  return (
    <Layout showAsideMenu={false} headerMenuActive={EHeaderMenuKey.review}>
      <main className="review-page rounded-[6px] bg-bg-white">
        <h1 className="page-heading">每日复盘</h1>
        <p className="review-intro">查看当天市场背景，从策略候选中选出0–3只观察股票，整理下一交易日的观察名单与计划。</p>
        <Space className="mb-16" wrap>
          <span>复盘交易日期</span>
          <DatePicker aria-label="复盘交易日期" value={date ? dayjs(date) : null} allowClear={false} onChange={(v) => { if (v) changeDate(v.format('YYYY-MM-DD')); }} />
          <span className="review-caption">切换日期会恢复该日草稿</span>
        </Space>
        {fallback.error && <Alert type="error" message={fallback.error} action={<Button onClick={fallback.retry}>重试</Button>} />}
        {date && user && <Report key={`${user.id}:${date}`} date={date} account={user.id} />}
      </main>
    </Layout>
  );
}
