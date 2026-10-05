'use client';

import { ExternalLink, InteractionButton } from '@/components/Interaction';

import { useState } from 'react';
import {
  Alert, Card, Collapse, Modal, Space, Tag,
} from 'antd';
import Table from '@/components/DataTable';
import { scaledNumber } from '@/utils/format';
import { SourceState, useWorkbench } from './workbench';

export function RiskDetails({ code, date }: { code: string; date: string }) {
  const state = useWorkbench('risk-detail', { code, date }, !!code && !!date);
  const { data } = state;
  return (
    <div className="basic-workbench">
      <SourceState data={data} error={state.error} retry={state.retry} />
      <p>
        {data?.board || ''}
        {' '}
        · 公告截止
        {' '}
        {date}
        ；近180日公告与减持记录。
        {data?.generatedAt && `查询时间 ${new Date(data.generatedAt).toLocaleString('zh-CN')}`}
      </p>
      <Alert className="mb-16" type="warning" showIcon message="核验状态：待核验" description={data?.note || '风险资料加载中，核验状态暂为待核验。'} />
      <Card size="small" title="已披露的财务与审计字段" className="mb-16">
        <p>
          扣非净利润：
          {scaledNumber(data?.financial?.profit_dedt, 100000000)}
          {' '}
          亿元（报告期
          {data?.financial?.end_date || '待补齐'}
          ，公告日
          {data?.financial?.ann_date || '待补齐'}
          ）
        </p>
        <p>
          归母净资产：
          {scaledNumber(data?.balance?.total_hldr_eqy_exc_min_int, 100000000)}
          {' '}
          亿元（报告期
          {data?.balance?.end_date || '待补齐'}
          ）
        </p>
        <p>
          审计意见：
          {data?.audit?.audit_result || '待补齐'}
          （报告期
          {data?.audit?.end_date || '待补齐'}
          ）
        </p>
        <p>财务与审计字段用于初步核验；营收扣除口径、内控意见、治理和连续交易指标等需按所属板块的适用规则进一步核验。</p>
      </Card>
      {!!data?.items?.length && (
      <Card size="small" title="已取得的风险／交易状态记录">
        <ul>
          {data.items.map((r: any) => (
            <li key={`${r.tsCode}-${r.type}-${r.eventDate}-${r.detail}`}>
              <Tag color="orange">{r.type}</Tag>
              {r.eventDate}
              ：
              {r.detail}
            </li>
          ))}
        </ul>
      </Card>
      )}
      {!!data?.findings?.length && (
      <Card size="small" title="财务与审计异常事实">
        <ul>
          {data.findings.map((r: any) => (
            <li key={r.detail}>
              {r.date}
              ：
              {r.detail}
            </li>
          ))}
        </ul>
      </Card>
      )}
      <Collapse className="mb-16" items={(data?.checks || []).map((r: any) => ({ key: r.key, label: `${r.label} · 待核验${r.leads ? `（${r.leads}条线索）` : ''}`, children: r.scope }))} />
      <h3>公告原文与线索</h3>
      <p>按标题关键词检索公告，结果包含完成、取消和澄清类公告。标题检索覆盖范围有限，具体影响需结合公告正文核验。</p>
      <Table
        loading={state.loading}
        rowKey={(r: any) => `${r.date}-${r.title}-${r.url}`}
        dataSource={data?.announcements || []}
        pagination={{ pageSize: 10 }}
        columns={[
          { title: '公告日', dataIndex: 'date', width: 110 },
          { title: '标题', dataIndex: 'title', render: (v, r: any) => (r.url ? <ExternalLink href={r.url} target="_blank" rel="noreferrer">{v}</ExternalLink> : v) },
          {
            title: '核验线索', key: 'leads', width: 140, render: (_, r: any) => (r.categories.length ? <Tag color="orange">需要核对正文</Tag> : '未命中标题规则'),
          },
        ]}
      />
      <Space wrap>
        <ExternalLink href="https://www.sse.com.cn/lawandrules/" target="_blank" rel="noreferrer">上交所规则</ExternalLink>
        <ExternalLink href="https://www.szse.cn/lawrules/" target="_blank" rel="noreferrer">深交所规则</ExternalLink>
        <ExternalLink href="https://www.bse.cn/" target="_blank" rel="noreferrer">北交所规则及公告</ExternalLink>
      </Space>
    </div>
  );
}

export default function RiskInspect({ code, date }: { code: string; date: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <InteractionButton intent="preview" size="small" onClick={() => setOpen(true)}>风险核验</InteractionButton>
      <Modal open={open} title={`${code} 风险核验`} onCancel={() => setOpen(false)} footer={null} width={960} destroyOnClose>{open && <RiskDetails code={code} date={date} />}</Modal>
    </>
  );
}
