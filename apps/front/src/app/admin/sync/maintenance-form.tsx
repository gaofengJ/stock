'use client';

import {
  Collapse, DatePicker, Form, Radio, Button, Typography,
} from 'antd';
import type { FormInstance } from 'antd';
import type { Dayjs } from 'dayjs';
import { getCandidateDate } from '@/hooks/useDefaultTradeDate';

export const modes = [
  {
    value: 'missing',
    label: '行情缺失补齐',
    title: '补齐缺失数据',
    action: '开始补齐',
    description: '某天没有行情、同步失败或数据不完整时使用。已有完整行情会保留。',
    scope: '校验并补齐个股日线、涨跌停、指数日线、情绪与市场汇总。其他模块由各自任务处理。',
  },
  {
    value: 'refresh',
    label: '行情重新采集并计算',
    title: '重新获取行情',
    action: '重新获取行情',
    description: '已有行情有误，或需要重新获取同一天的数据时使用。无需先清空数据。',
    scope: '重新获取个股日线、涨跌停和指数日线，并重算情绪与市场汇总。关联模块可能另行排队，以对应任务结果为准。',
  },
  {
    value: 'breadth',
    label: '均线广度补齐',
    title: '补齐均线广度',
    action: '补齐均线广度',
    description: '均线广度缺失或显示未就绪时使用，依赖对应日期的基础行情。',
    scope: '只补齐均线广度。已有完整广度数据会跳过。',
  },
  {
    value: 'sector',
    label: '同花顺板块与成分',
    title: '同步板块与成分',
    action: '同步板块与成分',
    description: '同花顺板块目录、成分或板块日线缺失时使用。',
    scope: '同步板块目录和成分，再补齐日期范围内缺失的板块日线。',
  },
  {
    value: 'technical',
    label: '策略复权行情',
    title: '补齐策略复权行情',
    action: '补齐策略复权行情',
    description: '策略提示复权行情未就绪时使用。',
    scope: '只补齐策略需要的复权行情。已有完整数据会跳过。',
  },
  {
    value: 'insights',
    label: '市场与策略观察',
    title: '补齐市场与策略观察',
    action: '补齐观察统计',
    description: '市场观察或策略观察统计缺失时使用，依赖相关基础数据。',
    scope: '只补齐市场和策略观察统计。已有完整统计会跳过。',
  },
  {
    value: 'hot',
    label: '同花顺日终人气',
    title: '补齐日终人气',
    action: '补齐日终人气',
    description: '同花顺日终人气数据缺失时使用。',
    scope: '只补齐同花顺日终人气。已有完整数据会跳过。',
  },
];

export interface SyncSubmission { startDate: string; endDate: string; mode: string }
interface Values { mode: string; dateScope: 'day' | 'range'; syncDate?: Dayjs; syncDates?: [Dayjs, Dayjs] }

// Match the server's Beijing 20:30 cutoff, independently of the browser timezone.
function availableDate() {
  return getCandidateDate().format('YYYY-MM-DD');
}

function rangeError(dates?: (Dayjs | null)[] | null) {
  if (!dates?.[0]?.isValid() || !dates[1]?.isValid()) return '请选择完整的起止日期';
  if (dates[0].format('YYYY-MM-DD') > dates[1].format('YYYY-MM-DD')) return '开始日期不能晚于结束日期';
  if (dates[0].format('YYYY-MM-DD') < dates[1].subtract(2, 'year').format('YYYY-MM-DD')) return '同步日期跨度不能超过两个自然年';
  if (dates[1].format('YYYY-MM-DD') > availableDate()) return '请选择已到同步时间的日期，当日数据在北京时间 20:30 后可同步';
  return '';
}

export function jobGuidance(status: string) {
  const guidance: Record<string, string> = {
    queued: '已进入执行队列，等待服务器处理。可以关闭页面，任务会继续。',
    running: '服务器正在处理，可以关闭页面。执行结果会自动更新。',
    pending: '系统会在下次重试时间再次执行。可以等待，也可以重新排队继续原任务。',
    success: '本任务范围已校验完成。下表展示各模块的最新数据状态，其他模块以对应任务结果为准。',
    failed: '自动重试已停止。先查看错误说明，处理数据源或前置数据问题后，再重新排队。',
    interrupted: '任务已中断。重新排队可继续原任务，已保存的数据会保留。',
    paused: '任务已暂停，已保存的数据会保留。需要继续时，在执行记录中点击“继续排队”。',
    pausing: '暂停请求已收到，当前批次结束后生效。',
    cancelled: '任务已取消，已保存的数据会保留。需要再次处理时，请提交新任务。',
    cancelling: '取消请求已收到，当前批次结束后生效。已保存的数据会保留。',
  };
  return guidance[status] || '执行结果会自动更新。';
}

export default function MaintenanceForm({
  form, submitting, disabled, onSubmit,
}: {
  form: FormInstance<Values>; submitting: boolean; disabled: boolean; onSubmit: (values: SyncSubmission) => Promise<void>;
}) {
  const mode = Form.useWatch('mode', form) || 'missing';
  const dateScope = Form.useWatch('dateScope', form) || 'day';
  const operation = modes.find((m) => m.value === mode) || modes[0];
  const advanced = !['missing', 'refresh'].includes(mode);
  return (
    <Form<Values>
      id="sync-maintenance"
      form={form}
      className="sync-maintenance account-surface"
      layout="vertical"
      initialValues={{ mode: 'missing', dateScope: 'day' }}
      disabled={submitting || disabled}
      onFinish={({
        syncDate, syncDates, dateScope: scope, mode: selectedMode,
      }) => {
        const start = scope === 'day' ? syncDate! : syncDates![0];
        const end = scope === 'day' ? syncDate! : syncDates![1];
        return onSubmit({ startDate: start.format('YYYY-MM-DD'), endDate: end.format('YYYY-MM-DD'), mode: selectedMode });
      }}
      onKeyDown={(event) => {
        // Enter confirms a typed date without submitting maintenance.
        if (event.key === 'Enter' && event.target instanceof HTMLElement && event.target.closest('.ant-picker')) event.preventDefault();
      }}
    >
      <Typography.Title level={4} className="account-section-heading">1. 选择维护目的</Typography.Title>
      <Form.Item name="mode" className="sync-purpose-field">
        <Radio.Group name="sync-purpose" aria-label="维护目的">
          <div className="sync-purpose-options">
            {modes.slice(0, 2).map((m) => (
              <Radio key={m.value} value={m.value} className="sync-purpose">
                <strong>{m.title}</strong>
                <span>{m.description}</span>
              </Radio>
            ))}
          </div>
          <Collapse
            className="sync-advanced"
            ghost
            defaultActiveKey={advanced ? ['modules'] : []}
            items={[{
              key: 'modules',
              label: `高级维护：单独修复模块${advanced ? `（已选：${operation.title}）` : ''}`,
              children: (
                <div className="sync-module-options">
                  {modes.slice(2).map((m) => (
                    <Radio key={m.value} value={m.value} className="sync-purpose">
                      <strong>{m.title}</strong>
                      <span>{m.description}</span>
                    </Radio>
                  ))}
                </div>
              ),
            }]}
          />
        </Radio.Group>
      </Form.Item>
      <Typography.Title level={4} className="account-section-heading">2. 选择需要维护的日期</Typography.Title>
      <div className="sync-date-controls">
        <Form.Item name="dateScope" className="sync-date-scope">
          <Radio.Group
            name="sync-date-scope"
            aria-label="维护日期范围"
            optionType="button"
            options={[{ value: 'day', label: '一天' }, { value: 'range', label: '一段时间' }]}
            onChange={({ target }) => {
              const date = form.getFieldValue('syncDate');
              const range = form.getFieldValue('syncDates');
              if (target.value === 'range' && date && !range) form.setFieldValue('syncDates', [date, date]);
              if (target.value === 'day' && range && !date) form.setFieldValue('syncDate', range[0]);
            }}
          />
        </Form.Item>
        {dateScope === 'day' ? (
          <Form.Item
            name="syncDate"
            rules={[{
              validator: async (_, value: Dayjs | undefined) => {
                if (!value?.isValid()) throw new Error('请选择需要维护的日期');
                const error = rangeError([value, value]);
                if (error) throw new Error(error);
              },
            }]}
          >
            <DatePicker aria-label="维护日期" placeholder="选择需要维护的交易日" disabledDate={(date) => date.format('YYYY-MM-DD') > availableDate()} />
          </Form.Item>
        ) : (
          <Form.Item name="syncDates" rules={[{ validator: async (_, value) => { const error = rangeError(value); if (error) throw new Error(error); } }]}>
            <DatePicker.RangePicker aria-label="维护日期区间" placeholder={['开始日期', '结束日期']} disabledDate={(date) => date.format('YYYY-MM-DD') > availableDate()} />
          </Form.Item>
        )}
      </div>
      <Typography.Paragraph type="secondary" className="sync-date-hint">仅处理已到同步时间的交易日；当天数据在北京时间 20:30 后可同步，区间跨度最多两个自然年。</Typography.Paragraph>
      <div className="sync-operation-summary" aria-live="polite">
        <strong>{`当前操作：${operation.title}`}</strong>
        <span>{operation.scope}</span>
      </div>
      <div className="sync-maintenance-footer">
        <Button type="primary" loading={submitting} disabled={disabled} htmlType="submit">{operation.action}</Button>
        <span>提交后自动打开任务详情；之后可在下方“执行记录”查看进度和错误原因。</span>
      </div>
    </Form>
  );
}
