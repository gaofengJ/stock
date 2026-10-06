'use client';

import {
  Button, Form, InputNumber, Space,
} from 'antd';

export default function TurnoverFilter({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const [form] = Form.useForm();
  return (
    <Form form={form} layout="inline" colon={false} requiredMark={false} initialValues={{ minimum: value }} onFinish={({ minimum }) => onChange(minimum)}>
      <Space wrap size={[12, 8]}>
        <Form.Item name="minimum" label="每日自由流通换手率 >" style={{ margin: 0 }} rules={[{ required: true, message: '请输入换手率' }]}>
          <InputNumber aria-label="最低自由流通换手率" min={0} max={1000} precision={2} step={0.5} addonAfter="%" style={{ width: 140 }} />
        </Form.Item>
        <Button type="primary" htmlType="submit">应用筛选</Button>
        <Button onClick={() => { form.setFieldsValue({ minimum: 5 }); onChange(5); }}>恢复默认</Button>
        <span className="strategy-caption">仅作用于当前策略，各策略独立保存</span>
      </Space>
    </Form>
  );
}
