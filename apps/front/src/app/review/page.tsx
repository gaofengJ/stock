'use client';

import { InteractionButton } from '@/components/Interaction';

import { useEffect, useState } from 'react';
import {
  Alert, Button, Card, Checkbox, DatePicker, Input, Select, Space, Tag,
} from 'antd';
import dayjs from 'dayjs';
import Layout from '@/components/Layout';
import { EHeaderMenuKey } from '@/components/Layout/enum';
import Table from '@/components/DataTable';
import request from '@/api/request';
import { errorMessage } from '@/api/errors';
import { useDefaultTradeDate } from '@/hooks/useDefaultTradeDate';
import { scaledNumber } from '@/utils/format';
import StockChart from '../strategy/StockChart';
import { trendDefaults } from '../strategy/strategy-options';
import CandidateEnvironment from '../strategy/CandidateEnvironment';
import RiskInspect from '../basic/components/RiskInspect';
import { RiskTags, SourceState, useWorkbench } from '../basic/components/workbench';
import Holdings from './Holdings';
import '../strategy/strategy.sass';

function Report({ date }: { date: string }) {
  const [data, setData] = useState<any>(null); const [error, setError] = useState('');
  const [loading, setLoading] = useState(true); const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<string[]>([]); const [notes, setNotes] = useState<Record<string, string>>({});
  const [focus, setFocus] = useState(''); const [exit, setExit] = useState(''); const [reason, setReason] = useState('');
  const [filter, setFilter] = useState('within'); const [keyword, setKeyword] = useState(''); const [stock, setStock] = useState<any>(null);
  const [showHoldings, setShowHoldings] = useState(false);
  const risk = useWorkbench('risk', { date }, !!data);
  useEffect(() => {
    const abort = new AbortController(); let active = true;
    setLoading(true); setError(''); setData(null); setSelected([]);
    request.get('/review/report', {
      params: { date }, timeout: 190000, signal: abort.signal, autoShowError: false,
    })
      .then((r) => { if (active) setData(r.data); })
      .catch((e) => { if (active) setError(errorMessage(e, '报告生成失败，请重试')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; abort.abort(); };
  }, [date, attempt]);
  const blocked = (row: any) => row.risk.state === 'excluded' || risk.data?.items?.some((r: any) => r.tsCode === row.tsCode && ['ST', '停牌', '减持'].includes(r.type));
  const rows: any[] = data?.items || [];
  const chosen = rows.filter((r) => selected.includes(r.tsCode));
  const filtered = rows.filter((r) => (!keyword || `${r.tsCode} ${r.name}`.includes(keyword.trim()))
    && (filter === 'all' || (filter === 'within' && r.capState === 'within' && !blocked(r)) || (filter === 'excluded' && blocked(r)) || (filter === 'missing' && r.capState === 'missing')));
  const download = () => {
    const text = [
      `# ${date} 短线复盘`, `生成时间：${data.generatedAt}；策略覆盖：${data.strategies.filter((s: any) => s.state === 'ready').length}/${data.strategies.length}。`,
      '范围：按全部策略的默认参数生成候选，合并重复股票；总市值小于200亿元，按流通市值升序排列。',
      '## 观察名单（手动选定，风险核验状态单独列示）',
      ...chosen.map((r) => `- ${r.name} ${r.tsCode}：${r.strategies.map((s: any) => s.label).join('、')}；总市值${scaledNumber(r.totalMv, 10000)}亿／流通${scaledNumber(r.circMv, 10000)}亿；${blocked(r) ? '已知事项排除，请移出名单' : '风险待核验'}。\n  看图与计划：${notes[r.tsCode] || '待填写'}`),
      `## 明日计划\n重点观察：${focus || '待填写'}\n放弃／退出条件：${exit || '待填写'}\n新机会更好的理由：${reason || '待填写'}`,
      '## 核验清单\n减持计划与进展；重大利空；财务与审计；内控／治理／资金占用／违规担保；分红等其他风险警示；交易类与重大违法退市。未完成的事项标记为待核验。',
      `数据说明：${data.riskNote} 历史日期按当前取得的数据回看，查询时间与观察日期分别记录。`,
    ].join('\n\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `短线复盘-${date}.md`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <>
      <Space className="mb-16" wrap>
        <Button loading={loading} onClick={() => setAttempt((v) => v + 1)}>重新生成</Button>
        <Button disabled={!data || loading} onClick={download}>导出当前复盘</Button>
      </Space>
      {error && <Alert type="error" message={error} />}
      <Card size="small" title="复盘规则" className="mb-16">
        <p>全部策略 · 总市值小于200亿 · 流通市值优先 · 偏好低价，不设硬性股价门槛 · 看图选0–3只</p>
        <p>竞价／开盘观察或回踩支撑；跌破5日线次日未收回、持有约3个交易日未走强时复核。结合概念线索与个股走势填写观察计划。</p>
        <p>报告基于策略候选生成，持仓分析可单独开启。行情截至所选交易日收盘，公告按该日已披露信息筛选；历史回看采用当前可用资料。</p>
      </Card>
      {data && (
      <>
        <Space className="mb-16" wrap>
          <strong>
            合并去重
            {rows.length}
            {' '}
            只
          </strong>
          <span>
            总市值符合
            {data.counts.withinCap}
            {' '}
            只
          </span>
          <span>
            市值缺失
            {data.counts.missingCap}
            {' '}
            只
          </span>
          <span>
            已选
            {selected.length}
            /3
          </span>
        </Space>
        {!data.complete && <Alert type="warning" className="mb-16" message="部分策略未取得结果，当前候选池不完整，请稍后重新生成" />}
        <Space className="mb-16" wrap>
          {data.strategies.map((s: any) => (
            <Tag key={s.key} color={s.state === 'ready' ? 'blue' : 'orange'}>
              {s.label}
              ：
              {s.count ?? '暂不可用'}
            </Tag>
          ))}
        </Space>
        <SourceState data={risk.data || data} error={risk.error} retry={risk.retry} />
        <Alert type="info" className="mb-16" message="候选池仍需风险核验和看图确认" description="默认隐藏已知ST、停牌和近180日减持记录。其余减持计划、公告利空及潜在ST风险按股票逐项核验，资料不足的事项保留待核验状态。可手动选择最多3只股票加入观察名单。" />
      </>
      )}
      <Space className="mb-16" wrap>
        <Select aria-label="候选范围" value={filter} onChange={setFilter} style={{ width: 240 }} options={[{ value: 'within', label: '市值符合、待核验的候选' }, { value: 'all', label: '全部策略命中' }, { value: 'excluded', label: '已知事项排除' }, { value: 'missing', label: '市值缺失待补齐' }]} />
        <Input allowClear placeholder="搜索代码／名称" value={keyword} onChange={(e) => setKeyword(e.target.value)} style={{ width: 220 }} />
      </Space>
      <Table
        loading={loading}
        rowKey="tsCode"
        dataSource={filtered}
        pagination={{ pageSize: 20, showSizeChanger: true }}
        scroll={{ x: 1150 }}
        columns={[
          {
            title: '观察名单', key: 'select', width: 85, render: (_, r: any) => <Checkbox aria-label={`选择${r.name}`} checked={selected.includes(r.tsCode)} disabled={!selected.includes(r.tsCode) && (selected.length >= 3 || r.capState !== 'within' || blocked(r))} onChange={(e) => setSelected(e.target.checked ? [...selected, r.tsCode] : selected.filter((c) => c !== r.tsCode))} />,
          },
          {
            title: '股票／看图',
            key: 'stock',
            width: 160,
            render: (_, r: any) => (
              <InteractionButton intent="preview" onClick={() => setStock(r)}>
                {r.name}
                <br />
                {r.tsCode}
              </InteractionButton>
            ),
          },
          {
            title: '命中策略', key: 'signals', width: 260, render: (_, r: any) => r.strategies.map((s: any) => <Tag key={s.key}>{s.label}</Tag>),
          },
          { title: '收盘价', dataIndex: 'close', width: 90 },
          {
            title: '总市值／亿', dataIndex: 'totalMv', width: 110, render: (v) => scaledNumber(v, 10000),
          },
          {
            title: '流通市值／亿', dataIndex: 'circMv', width: 120, render: (v) => scaledNumber(v, 10000),
          },
          {
            title: '风险信息',
            key: 'risk',
            width: 220,
            render: (_, r: any) => (
              <>
                <Tag color={blocked(r) ? 'red' : 'orange'}>{blocked(r) ? '已知事项排除' : '待核验'}</Tag>
                <RiskTags data={risk.data} code={r.tsCode} date={date} />
                <RiskInspect code={r.tsCode} date={date} />
              </>
            ),
          },
        ]}
      />
      <Card title="明日观察名单与计划" className="mb-16">
        {!chosen.length && <p>还没有选定观察股票；可以保持空缺。</p>}
        {chosen.map((r) => (
          <div key={r.tsCode} className="mb-16">
            <Space wrap>
              <strong>
                {r.name}
                {' '}
                {r.tsCode}
              </strong>
              <Tag color="orange">{blocked(r) ? '新发现已知事项，请移出名单' : '风险待核验'}</Tag>
              <RiskInspect code={r.tsCode} date={date} />
              <Button size="small" onClick={() => setSelected(selected.filter((code) => code !== r.tsCode))}>移出</Button>
            </Space>
            <Input.TextArea aria-label={`${r.name}看图与计划`} value={notes[r.tsCode] || ''} maxLength={2000} rows={3} placeholder="走势为什么漂亮？开盘观察／回踩条件、支撑位、放弃条件、风险原文核验结论与时间" onChange={(e) => setNotes({ ...notes, [r.tsCode]: e.target.value })} />
          </div>
        ))}
        <Input.TextArea className="mb-16" aria-label="明日重点观察" value={focus} onChange={(e) => setFocus(e.target.value)} maxLength={2000} placeholder="明日重点观察什么" />
        <Input.TextArea className="mb-16" aria-label="放弃或退出条件" value={exit} onChange={(e) => setExit(e.target.value)} maxLength={2000} placeholder="什么情况下放弃／退出" />
        <Input.TextArea aria-label="新机会理由" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} placeholder="新机会更好的理由；未输入持仓时无需比较替换" />
      </Card>
      <CandidateEnvironment date={date} />
      <Space className="mb-16">
        <Checkbox checked={showHoldings} onChange={(e) => setShowHoldings(e.target.checked)}>输入持仓，补充分析（可选）</Checkbox>
        <span>页面填写内容请及时导出；刷新或切换日期会清空。</span>
      </Space>
      {showHoldings && <Holdings date={date} candidates={chosen.map((r) => `${r.name} ${r.tsCode}`)} />}
      <StockChart stock={stock} date={date} strategy={stock?.strategies?.[0]?.key || 'fiveMaUp'} options={trendDefaults} onClose={() => setStock(null)} />
    </>
  );
}

export default function Page() {
  const fallback = useDefaultTradeDate(); const [chosenDate, setChosenDate] = useState('');
  const date = chosenDate || (fallback.ready ? fallback.tradeDate : '');
  return (
    <Layout showAsideMenu={false} headerMenuActive={EHeaderMenuKey.review}>
      <main className="p-16 rounded-[6px] bg-bg-white">
        <h1 className="page-heading">每日复盘</h1>
        <Space className="mb-16">
          <span>交易日期</span>
          <DatePicker aria-label="复盘交易日期" value={date ? dayjs(date) : null} allowClear={false} onChange={(v) => { if (v) setChosenDate(v.format('YYYY-MM-DD')); }} />
        </Space>
        {fallback.error && <Alert type="error" message={fallback.error} action={<Button onClick={fallback.retry}>重试</Button>} />}
        {date && <Report key={date} date={date} />}
      </main>
    </Layout>
  );
}
