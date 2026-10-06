'use client';

/* eslint jsx-a11y/label-has-associated-control: ["error", { "assert": "htmlFor" }] */

import { useEffect, useState } from 'react';
import {
  Alert, Button, Card, Checkbox, Collapse, DatePicker, Input, Select, Space, Tag, Tooltip,
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
import { numberText, scaledNumber } from '@/utils/format';
import StockChart from '../strategy/StockChart';
import { trendDefaults } from '../strategy/strategy-options';
import CandidateEnvironment from '../strategy/CandidateEnvironment';
import RiskInspect from '../basic/components/RiskInspect';
import { RiskTags, SourceState, useWorkbench } from '../basic/components/workbench';
import { currentReduction } from '../basic/components/risk-display';
import Holdings from './Holdings';
import useReviewDraft from './useReviewDraft';
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
  const [showHoldings, setShowHoldings] = useState(false);
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
  const filtered = rows.filter((r) => (!keyword.trim() || `${r.tsCode} ${r.name}`.includes(keyword.trim()))
    && (filter === 'all' || (filter === 'within' && r.capState === 'within' && !blocked(r)) || (filter === 'excluded' && blocked(r)) || (filter === 'missing' && r.capState === 'missing')));
  const selectionReason = (row: any) => {
    if (!ready) return '正在读取草稿';
    if (loading) return '候选更新中，请稍候';
    if (selected.includes(row.tsCode)) return '';
    if (blocked(row)) return '已知风险事项排除，不能加入观察名单';
    if (row.capState !== 'within') return '总市值需小于200亿元且资料完整';
    if (selected.length >= 3) return '最多选择3只，请先移出一只';
    return '';
  };
  const remove = (code: string) => update({ selected: draft.selected.filter((r) => r.tsCode !== code) });
  const plan = () => document.getElementById('review-plan')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const riskLabel = (row: any) => {
    if (!row) return data ? '本次候选未包含，请重新确认' : '候选资料尚未取得';
    if (blocked(row)) return '已知风险事项，请移出名单';
    if (row.capState !== 'within') return '市值条件不符，请重新确认';
    return '风险资料待核验';
  };
  const download = () => {
    const text = [
      `# ${date} 每日复盘与下一交易日计划`,
      `候选生成时间：${data?.generatedAt || '尚未取得'}；导出时间：${new Date().toISOString()}。`,
      '候选范围：全部策略默认参数，合并重复股票；总市值小于200亿元，默认按流通市值从小到大排列。',
      '## 观察名单',
      ...(chosen.length ? chosen.map(({ name, tsCode, row }) => `- ${row?.name || name} ${tsCode}：${row?.strategies?.map((s: any) => s.label).join('、') || '候选资料待确认'}；${riskLabel(row)}。\n  看图与观察条件：${draft.notes[tsCode] || '待填写'}\n  人工风险核验记录：${draft.riskNotes[tsCode] || '未记录'}`) : ['本次未选观察股票。']),
      `## 下一交易日计划\n重点观察：${draft.focus || '待填写'}\n放弃／退出条件：${draft.exit || '待填写'}\n新机会与持仓比较：${draft.reason || '未填写'}`,
      '## 数据与核验说明\n人工记录仅为本次复盘笔记；风险资料状态单独列示。请结合公告原文记录减持、重大利空及财务审计等事项的核验结论与时间。',
      `数据说明：${data?.riskNote || '候选资料尚未取得。'} 历史日期按当前可用资料回看。`,
    ].join('\n\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `每日复盘-${date}.md`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
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
          <Button loading={loading} onClick={() => setAttempt((v) => v + 1)}>更新候选数据</Button>
          <Button type="primary" disabled={!ready} onClick={download}>导出复盘与计划</Button>
        </Space>
      </div>
      <div className="review-steps" aria-label="复盘操作流程">
        {[
          ['看市场背景', '先了解所选交易日的市场涨跌与成交情况'],
          ['筛选观察股票', '查看走势和风险资料，选择0–3只股票'],
          ['填写并导出计划', '记录观察条件、核验结论和放弃条件'],
        ].map(([title, description], i) => (
          <div className="review-step" key={title}>
            <span className="review-step-number">{i + 1}</span>
            <div>
              <strong>{title}</strong>
              <span className="review-caption">{description}</span>
            </div>
          </div>
        ))}
      </div>
      <CandidateEnvironment date={date} />
      {error && <Alert type="error" showIcon message={error} description={data ? '当前仍展示上次取得的候选；观察名单和草稿已保留。' : '可以继续填写计划并导出草稿。'} action={<Button onClick={() => setAttempt((v) => v + 1)}>重试</Button>} />}
      {data && !data.complete && <Alert type="warning" showIcon message="部分策略未取得结果，候选范围不完整" description="可继续记录计划，稍后点击“更新候选数据”重试。" />}
      <div className="review-workspace">
        <section className="review-candidates" aria-labelledby="review-candidates-title">
          <div className="review-section-heading">
            <h2 id="review-candidates-title">筛选观察股票</h2>
            <Button onClick={plan}>{`已选 ${selected.length}/3 · 填写计划`}</Button>
          </div>
          <div className="review-counts">
            <span>{`策略命中（去重） ${data ? rows.length : '—'} 只`}</span>
            <strong>{`可加入观察 ${data ? eligible.length : '—'} 只`}</strong>
            <span>{`已知风险排除 ${data ? excludedCount : '—'} 只`}</span>
            <span>{`市值不符或缺失 ${data ? capCount : '—'} 只`}</span>
          </div>
          <p className="review-caption">查看股票的K线走势与风险资料，再勾选加入名单。默认按流通市值从小到大排列；排序仅反映市值。</p>
          <p className="review-caption">已知ST、停牌及进行中的已核实减持计划会被排除。可观察股票仍需逐项查看风险资料，核验记录填写在计划中。</p>
          <div className="review-filters">
            <Select aria-label="候选范围" value={filter} onChange={setFilter} options={[{ value: 'within', label: '可加入观察的股票' }, { value: 'all', label: '全部策略命中' }, { value: 'excluded', label: '已知风险排除' }, { value: 'missing', label: '市值资料缺失' }]} />
            <Input allowClear aria-label="搜索候选股票" placeholder="输入股票名称或代码" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
          </div>
          <Table
            loading={loading}
            rowKey="tsCode"
            dataSource={filtered}
            rowClassName={(r: any) => (selected.includes(r.tsCode) ? 'interaction-selected-row' : '')}
            maxBodyHeight={560}
            pagination={{
              defaultPageSize: 10, showSizeChanger: true, pageSizeOptions: [10, 20, 50], showTotal: (total) => `当前范围 ${total} 只`,
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
                      <RiskInspect code={r.tsCode} date={date} />
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
                title: '流通市值／亿', dataIndex: 'circMv', width: 115, align: 'right', sorter: (a: any, b: any) => (a.circMv ?? Infinity) - (b.circMv ?? Infinity), defaultSortOrder: 'ascend', render: (v) => scaledNumber(v, 10000),
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
          <Collapse
            className="review-details"
            items={[
              {
                key: 'rules',
                label: '候选生成规则与数据说明',
                children: (
                  <>
                    <p>使用平台全部策略的默认参数，合并同一只股票的命中结果。观察名单限定总市值小于200亿元，最多3只，也可以不选股票。</p>
                    <p>“入选线索”表示触发的策略条件。请结合K线判断走势，并在计划中记录观察条件、支撑位和放弃条件。</p>
                    <p>行情截至所选交易日收盘；公告按该日已披露信息筛选。历史日期采用当前可用资料回看。人工核验记录与系统风险状态分别保留。</p>
                    <p>短线复核参考：跌破5日线后下一交易日未收回，或持有约3个交易日未走强时，复核原观察逻辑。</p>
                    <SourceState data={risk.data || data} error={risk.error} retry={risk.retry} />
                  </>
                ),
              },
              {
                key: 'strategies',
                label: `各策略命中数量${data ? `（已取得 ${data.strategies.filter((s: any) => s.state === 'ready').length}/${data.strategies.length}）` : ''}`,
                children: (
                  <>
                    <p>一只股票可以同时命中多个策略，各策略数量可能重叠。</p>
                    <Space wrap>{data?.strategies.map((s: any) => <Tag key={s.key} color={s.state === 'ready' ? undefined : 'orange'}>{`${s.label}：${s.count ?? '暂不可用'}`}</Tag>)}</Space>
                  </>
                ),
              },
            ]}
          />
        </section>
        <aside className="review-plan" id="review-plan" aria-label="观察名单与下一交易日计划">
          <Card title={`观察名单与计划 · ${selected.length}/3`}>
            <p className="review-caption">用于所选日期之后的下一交易日。先记录为什么观察，再写触发条件和放弃条件。</p>
            {!chosen.length && (
            <div className="review-empty">
              还没有选观察股票。
              <br />
              在候选表勾选股票后，会在这里出现；也可只填写市场计划，保持空名单。
            </div>
            )}
            {chosen.map(({ name, tsCode, row }) => (
              <div key={tsCode} className="review-pick">
                <div className="review-pick-heading">
                  <strong>{row?.name || name}</strong>
                  <Button size="small" onClick={() => remove(tsCode)}>移出</Button>
                </div>
                <span className="review-caption">{tsCode}</span>
                <div className="review-stock-actions">
                  {row && <InteractionButton intent="preview" onClick={() => setStock(row)}>看K线</InteractionButton>}
                  <RiskInspect code={tsCode} date={date} />
                </div>
                <Tag color={row && blocked(row) ? 'red' : 'orange'}>{riskLabel(row)}</Tag>
                <label className="review-field" htmlFor={`review-note-${tsCode}`}>
                  <span>观察理由与触发条件</span>
                  <Input.TextArea id={`review-note-${tsCode}`} aria-label={`${name}看图与计划`} disabled={!ready} value={draft.notes[tsCode] || ''} maxLength={2000} rows={3} placeholder="例如：观察回踩支撑后的走势；记录支撑位、观察条件及放弃条件" onChange={(e) => update({ notes: { ...draft.notes, [tsCode]: e.target.value } })} />
                </label>
                <label className="review-field" htmlFor={`review-risk-${tsCode}`}>
                  <span>人工风险核验记录</span>
                  <Input.TextArea id={`review-risk-${tsCode}`} aria-label={`${name}风险核验记录`} disabled={!ready} value={draft.riskNotes[tsCode] || ''} maxLength={2000} rows={2} placeholder="查看风险资料后，记录公告原文、核验结论与时间；缺失事项也请记录" onChange={(e) => update({ riskNotes: { ...draft.riskNotes, [tsCode]: e.target.value } })} />
                </label>
                {draft.riskNotes[tsCode]?.trim() && <span className="review-caption">已填写人工记录，系统风险资料状态仍单独显示。</span>}
              </div>
            ))}
            <label className="review-field" htmlFor="review-focus">
              <span>下一交易日重点观察</span>
              <Input.TextArea id="review-focus" aria-label="下一交易日重点观察" disabled={!ready} value={draft.focus} onChange={(e) => update({ focus: e.target.value })} maxLength={2000} rows={3} placeholder="例如：关注哪些方向、市场量能和候选走势" />
            </label>
            <label className="review-field" htmlFor="review-exit">
              <span>放弃或退出条件</span>
              <Input.TextArea id="review-exit" aria-label="放弃或退出条件" disabled={!ready} value={draft.exit} onChange={(e) => update({ exit: e.target.value })} maxLength={2000} rows={2} placeholder="例如：走势未兑现、出现新风险时如何处理" />
            </label>
            <div className="review-plan-actions">
              <Button type="primary" disabled={!ready} onClick={download}>导出复盘与计划</Button>
              <span className="review-caption">Markdown 文件</span>
            </div>
            <p role="status" className="review-caption">
              {status}
              。刷新、切换日期后可恢复；更换浏览器或设备需使用导出文件。
            </p>
          </Card>
        </aside>
      </div>
      <div className="review-holdings">
        <Checkbox checked={showHoldings} onChange={(e) => setShowHoldings(e.target.checked)}>补充持仓分析（可选）</Checkbox>
        <p className="review-caption">输入持仓后查看持有天数和5日线情况，再与观察名单比较。持仓输入仅用于本次分析。</p>
      </div>
      {showHoldings && (
      <>
        <Holdings date={date} candidates={chosen.map((r) => `${r.name} ${r.tsCode}`)} />
        <label className="review-field" htmlFor="review-reason">
          <span>新机会与持仓比较（可选，随计划保存）</span>
          <Input.TextArea id="review-reason" aria-label="新机会理由" disabled={!ready} value={draft.reason} onChange={(e) => update({ reason: e.target.value })} maxLength={2000} placeholder="比较走势、风险和原持仓理由，记录是否需要调整观察计划" />
        </label>
      </>
      )}
      <StockChart stock={stock} date={date} strategy={stock?.strategies?.[0]?.key || 'fiveMaUp'} options={trendDefaults} onClose={() => setStock(null)} />
    </>
  );
}

export default function Page() {
  const fallback = useDefaultTradeDate();
  const { user } = useAccount();
  const [chosenDate, setChosenDate] = useState('');
  const date = chosenDate || (fallback.ready ? fallback.tradeDate : '');
  return (
    <Layout showAsideMenu={false} headerMenuActive={EHeaderMenuKey.review}>
      <main className="review-page p-16 rounded-[6px] bg-bg-white">
        <h1 className="page-heading">每日复盘</h1>
        <p className="review-intro">查看当天市场背景，从策略候选中选出0–3只观察股票，整理下一交易日的观察名单与计划。</p>
        <Space className="mb-16" wrap>
          <span>复盘交易日期</span>
          <DatePicker aria-label="复盘交易日期" value={date ? dayjs(date) : null} allowClear={false} onChange={(v) => { if (v) setChosenDate(v.format('YYYY-MM-DD')); }} />
          <span className="review-caption">切换日期会恢复该日草稿</span>
        </Space>
        {fallback.error && <Alert type="error" message={fallback.error} action={<Button onClick={fallback.retry}>重试</Button>} />}
        {date && user && <Report key={`${user.id}:${date}`} date={date} account={user.id} />}
      </main>
    </Layout>
  );
}
