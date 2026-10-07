'use client';

import { ExternalLink, InteractionButton } from '@/components/Interaction';
import { useState } from 'react';
import {
  Card, Collapse, Empty, Modal, Skeleton, Space, Tabs, Tag, Typography,
} from 'antd';
import Table from '@/components/DataTable';
import { scaledNumber } from '@/utils/format';
import { SourceState, useWorkbench } from './workbench';
import {
  currentReduction, reductionStateLabel, riskCheckLabel, riskDate, riskEventSources, riskMissing, riskRowKey, riskSectionTitle, riskSourcesReady,
} from './risk-display';

function Evidence({ records = [] }: { records?: any[] }) {
  return records.length ? (
    <ul className="risk-evidence-list">
      {records.map((record: any) => (
        <li key={`${record.kind}-${record.date}-${record.title}`}>
          <Space wrap size={6}>
            <Tag>{record.kind === 'financial' ? '财务事实' : '公告线索'}</Tag>
            <span className="basic-muted">{riskDate(record.date)}</span>
          </Space>
          <div>{record.url ? <ExternalLink href={record.url} target="_blank" rel="noreferrer">{record.title}</ExternalLink> : record.title}</div>
        </li>
      ))}
    </ul>
  ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无可展示的线索" />;
}

function RiskRecords({ items = [] }: { items?: any[] }) {
  return (
    <div className="risk-records">
      {items.map((record: any) => (
        <div className="risk-record" key={riskRowKey(record)}>
          <Space wrap size={6}>
            <Tag color={record.type !== '减持' || record.reductionState === 'active' ? 'orange' : undefined}>{record.type === '减持' ? reductionStateLabel(record.reductionState) : record.type}</Tag>
            {record.statusDate && (
            <span>
              状态日期：
              {riskDate(record.statusDate)}
            </span>
            )}
            {record.announcementDate && (
            <span>
              公告日：
              {riskDate(record.announcementDate)}
            </span>
            )}
            {record.effectiveDate && (
            <span>
              {record.type === '减持' ? '计划开始日：' : '发生／实施日：'}
              {riskDate(record.effectiveDate)}
            </span>
            )}
            {record.endDate && (
            <span>
              {record.type === '减持' ? '计划结束日：' : '截止日：'}
              {riskDate(record.endDate)}
            </span>
            )}
          </Space>
          {record.changeType && (
          <p className="basic-muted">
            最近状态变更：
            {record.changeType}
          </p>
          )}
          <Typography.Paragraph ellipsis={{ rows: 3, expandable: true, symbol: '展开完整说明' }}>{record.detail}</Typography.Paragraph>
          {!!record.changes?.length && (
          <Collapse
            size="small"
            items={[{
              key: 'changes',
              label: `查看已披露的状态变更（${record.changes.length}条）`,
              children: record.changes.map((change: any) => (
                <div className="risk-record" key={`${change.announcementDate}-${change.effectiveDate}-${change.type}-${change.detail}`}>
                  <Space wrap>
                    <Tag>{change.type || '状态变更'}</Tag>
                    <span>
                      公告日：
                      {riskDate(change.announcementDate)}
                    </span>
                    <span>
                      实施日：
                      {riskDate(change.effectiveDate)}
                    </span>
                  </Space>
                  <Typography.Paragraph ellipsis={{ rows: 3, expandable: true, symbol: '展开完整说明' }}>{change.detail}</Typography.Paragraph>
                </div>
              )),
            }]}
          />
          )}
        </div>
      ))}
    </div>
  );
}

export function RiskDetails({ code, date }: { code: string; date: string }) {
  const state = useWorkbench('risk-detail', { code, date }, !!code && !!date);
  const { data } = state;
  if (!data && state.loading) {
    return (
      <div className="basic-risk-details">
        <Skeleton active paragraph={{ rows: 7 }} />
        <p className="basic-muted">正在获取风险资料…</p>
      </div>
    );
  }
  if (!data) return <SourceState data={null} error={state.error} retry={state.retry} />;
  const sources = data.sources || [];
  const currentReductions = (data.items || []).filter((r: any) => currentReduction(r, date));
  let reductionEmpty = riskMissing(sources, 'reduction_plans', state.pollingStopped);
  const reductionReady = riskSourcesReady(sources, ['reduction_plans']) && !data.reductionCoverage?.unknown;
  if (reductionReady) reductionEmpty = '暂无已核实的当前减持计划';
  if (data.reductionCoverage?.unknown) reductionEmpty = '计划资料尚有待核实项';
  const otherEvents = (data.items || []).filter((r: any) => r.type !== '减持');
  const eventsReady = riskSourcesReady(sources, riskEventSources);
  const values = [
    {
      label: '扣非净利润', source: 'fina_indicator', record: data.financial, value: data.financial?.profit_dedt,
    },
    {
      label: '归母净资产', source: 'balancesheet', record: data.balance, value: data.balance?.total_hldr_eqy_exc_min_int,
    },
    {
      label: '审计意见', source: 'fina_audit', record: data.audit, value: data.audit?.audit_result,
    },
  ];
  return (
    <div className="basic-risk-details">
      <div className="risk-detail-heading">
        <strong>{data.name || code}</strong>
        <span>
          {data.board}
          {' '}
          观察日期：
          {' '}
          {riskDate(date)}
        </span>
      </div>
      <SourceState data={data} error={state.error} retry={state.retry} pollingStopped={state.pollingStopped} />
      <Tabs items={[
        {
          key: 'overview',
          label: '资料概览',
          children: (
            <>
              <Card size="small" title={riskSectionTitle('当前减持计划', currentReductions.length, '项', reductionReady)}>
                {currentReductions.length ? <RiskRecords items={currentReductions} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={reductionEmpty} />}
                <p className="basic-muted">
                  核验日期：
                  {riskDate(data.reductionDate)}
                  （今天）。展示公告中的计划起止日期，与交易观察日期无关；已完成、终止及到期的计划不展示。未核实资料不表示没有计划。
                </p>
              </Card>
              <div className="risk-financial-grid">
                {values.map((field) => {
                  const hasValue = field.value != null && field.value !== '';
                  let text = riskMissing(sources, field.source, state.pollingStopped);
                  if (hasValue) text = field.source === 'fina_audit' ? field.value : `${scaledNumber(field.value, 100000000)} 亿元`;
                  return (
                    <Card size="small" title={field.label} key={field.label}>
                      <strong className="risk-metric">{text}</strong>
                      {field.record && (
                      <p className="basic-muted">
                        报告期：
                        {riskDate(field.record.end_date)}
                        <br />
                        公告日：
                        {riskDate(field.record.f_ann_date || field.record.ann_date)}
                      </p>
                      )}
                    </Card>
                  );
                })}
              </div>
              {!!data.findings?.length && <Card size="small" title="已披露的财务异常事实"><Evidence records={data.findings.map((finding: any) => ({ kind: 'financial', date: finding.date, title: finding.detail }))} /></Card>}
              <Card size="small" title={riskSectionTitle('其他状态与事件', otherEvents.length, '条', eventsReady)}>
                {otherEvents.length ? <RiskRecords items={otherEvents} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={eventsReady ? '资料已获取，暂无其他状态或事件记录' : '部分状态资料尚未取得，已获取的记录仍可查看'} />}
              </Card>
              <p className="basic-muted">ST为所选日状态，最近一次变更不代表全部触发原因。财务异常及减持记录的具体影响需结合适用规则和公告正文核对。</p>
            </>
          ),
        },
        {
          key: 'checks',
          label: '分类线索',
          children: (
            <>
              <p className="basic-muted">{data.note}</p>
              <Collapse items={(data.checks || []).map((check: any) => ({
                key: check.key,
                label: (
                  <Space wrap>
                    <strong>{check.label}</strong>
                    <span>{riskCheckLabel(check)}</span>
                  </Space>
                ),
                children: (
                  <>
                    <p className="basic-muted">{check.scope}</p>
                    <Evidence records={check.evidence} />
                  </>
                ),
              }))}
              />
            </>
          ),
        },
        {
          key: 'announcements',
          label: `全部公告（${data.announcements?.length || 0}条）`,
          children: (
            <>
              <p className="basic-muted">
                公告范围：
                {riskDate(data.announcementStart)}
                {' '}
                至
                {riskDate(date)}
                。标题匹配包含完成、取消和澄清类公告，匹配数量不代表已确认的风险数量。
              </p>
              <Table
                autoHeight
                tableLayout="fixed"
                loading={state.loading}
                rowKey={(record: any) => `${record.date}-${record.title}-${record.url}`}
                dataSource={data.announcements || []}
                pagination={{ pageSize: 8, showSizeChanger: false }}
                scroll={{ x: undefined }}
                columns={[
                  {
                    title: '公告日', dataIndex: 'date', width: 110, render: riskDate,
                  },
                  {
                    title: '公告标题',
                    dataIndex: 'title',
                    render: (value, record: any) => (
                      <div className="risk-announcement-title">
                        {record.url ? <ExternalLink href={record.url} target="_blank" rel="noreferrer">{value}</ExternalLink> : value}
                        {!!record.categories?.length && <div className="basic-muted">含待核实线索</div>}
                      </div>
                    ),
                  },
                ]}
              />
            </>
          ),
        },
      ]}
      />
      <div className="risk-rule-links">
        <Space wrap>
          <ExternalLink href="https://www.sse.com.cn/lawandrules/" target="_blank" rel="noreferrer">上交所规则</ExternalLink>
          <ExternalLink href="https://www.szse.cn/lawrules/" target="_blank" rel="noreferrer">深交所规则</ExternalLink>
          <ExternalLink href="https://www.bse.cn/" target="_blank" rel="noreferrer">北交所规则及公告</ExternalLink>
        </Space>
      </div>
    </div>
  );
}

export default function RiskInspect({ code, date, name }: { code: string; date: string; name?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <InteractionButton intent="preview" aria-label={`${name || code}风险资料`} size="small" onClick={() => setOpen(true)}>风险资料</InteractionButton>
      <Modal className="basic-risk-modal" open={open} title={`${name ? `${name} ` : ''}${code} 风险资料`} onCancel={() => setOpen(false)} footer={null} width={1000} destroyOnClose>{open && <RiskDetails code={code} date={date} />}</Modal>
    </>
  );
}
