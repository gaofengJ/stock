'use client';

import { useState } from 'react';
import {
  Button, Checkbox, Collapse, Form, InputNumber, Radio, Space,
} from 'antd';

import { trendDefaults, TrendOptions } from './strategy-options';

export { trendDefaults, isTrendStrategy } from './strategy-options';
export type { TrendOptions } from './strategy-options';

export default function TrendParameters({ strategy, value, onChange }: { strategy: string; value: TrendOptions; onChange: (value: TrendOptions) => void }) {
  const [form] = Form.useForm<TrendOptions>();
  const expandingVolume = Form.useWatch('expandingVolume', form);
  const [dirty, setDirty] = useState(false);
  const number = (name: keyof TrendOptions, label: string, min: number, max: number, step = 1) => (
    <Form.Item
      key={name}
      name={name}
      label={label}
      rules={[{ required: true, message: '请填写参数' }, {
        type: 'number', min, max, message: `范围 ${min}–${max}`,
      }]}
    >
      <InputNumber min={min} max={max} step={step} precision={step === 1 ? 0 : 2} style={{ width: 100 }} />
    </Form.Item>
  );
  return (
    <Collapse
      className="strategy-parameters mb-16"
      size="small"
      items={[{
        key: 'parameters',
        label: dirty ? '调整筛选参数 - 尚未应用' : '调整筛选参数',
        children: (
          <Form form={form} layout="inline" initialValues={value} onValuesChange={() => setDirty(true)} onFinish={(values) => { setDirty(false); onChange({ ...trendDefaults, ...value, ...values }); }}>
            <Space size={[20, 8]} wrap align="start">
              {strategy !== 'fiveMaUp' && number('breakoutDays', '突破回看交易日', 5, 120)}
              {strategy === 'fiveMaUp' && (
              <Form.Item name="fiveMaMode" label="趋势状态">
                <Radio.Group options={[{ label: '当日新形成', value: 'new' }, { label: '当前满足', value: 'current' }]} />
              </Form.Item>
              )}
              {strategy === 'fiveMaUp' && (
              <Space wrap>
                <Form.Item name="aboveMa5" valuePropName="checked"><Checkbox>收盘高于MA5</Checkbox></Form.Item>
                <Form.Item name="bullish" valuePropName="checked"><Checkbox>当日收阳</Checkbox></Form.Item>
                <Form.Item name="expandingVolume" valuePropName="checked"><Checkbox>当日放量</Checkbox></Form.Item>
              </Space>
              )}
              {(strategy !== 'fiveMaUp' || expandingVolume) && number('volumeDays', '基准均量交易日', 3, 20)}
              {(strategy !== 'fiveMaUp' || expandingVolume) && number('volumeMultiple', '放量倍数 ≥', 1, 5, 0.1)}
              {strategy === 'breakoutPullback' && (
              <>
                {number('pullbackDays', '突破后最多交易日', 3, 20)}
                {number('pullbackBelow', '回踩下方容差（%）', 0, 10, 0.1)}
                {number('pullbackAbove', '回踩上方容差（%）', 0, 10, 0.1)}
                {number('contractionRatio', '回踩均量／突破量 ≤', 0.1, 1, 0.05)}
              </>
              )}
              <Space>
                <Button type="primary" htmlType="submit">应用</Button>
                <Button onClick={() => { setDirty(false); form.setFieldsValue(trendDefaults); onChange(trendDefaults); }}>恢复默认</Button>
              </Space>
            </Space>
          </Form>
        ),
      }]}
    />
  );
}
