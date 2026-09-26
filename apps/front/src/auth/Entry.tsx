'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Alert, Button, ConfigProvider, Form, Input, Typography, message,
} from 'antd';
import {
  BarChartOutlined, FundOutlined, ReadOutlined, UserOutlined, LockOutlined,
} from '@ant-design/icons';
import { themeConfig } from '@/components/Layout/config';
import ImgFengye from '@/assets/imgs/fengye.png';
import { useRouter } from 'next/navigation';
import { api } from './client';
import { useAccount } from './Boundary';

export default function Entry({ register = false }: { register?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const { refresh } = useAccount();
  return (
    <ConfigProvider theme={themeConfig}>
      <main className="entry-page">
        <div className="entry-brand">
          <img src={ImgFengye.src} alt="" />
          木风同学的投资小站
        </div>
        <div className="entry-shell">
          <section className="entry-intro">
            <div className="entry-eyebrow">木风 · 投资手记</div>
            <h1>
              读懂市场，
              <br />
              积累自己的判断。
            </h1>
            <p>从每日行情到市场复盘，把值得关注的变化，放在一起看。</p>
            <div className="entry-features">
              <div className="entry-feature">
                <BarChartOutlined />
                市场情绪与涨跌分析
              </div>
              <div className="entry-feature">
                <FundOutlined />
                行情数据与策略选股
              </div>
              <div className="entry-feature">
                <ReadOutlined />
                每日复盘与投资记录
              </div>
            </div>
          </section>
          <section className="entry-form">
            <h2>{register ? '创建你的账户' : '欢迎回来'}</h2>
            <Typography.Paragraph type="secondary">
              {register
                ? '无需邀请码，注册后即可开始浏览。'
                : '登录账户，继续关注市场的每一天。'}
            </Typography.Paragraph>
            {error && (
            <Alert
              type="error"
              message={error}
              showIcon
              style={{ marginBottom: 20 }}
            />
            )}
            <Form
              layout="vertical"
              onFinish={async (values) => {
                setBusy(true);
                setError('');
                try {
                  await api(
                    register ? '/auth/register' : '/auth/login',
                    'POST',
                    values,
                    false,
                  );
                  if (register) {
                    message.success('注册成功，请登录');
                    router.push('/login');
                  } else {
                    await refresh();
                    router.replace('/');
                  }
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Form.Item
                name="username"
                label="用户名"
                rules={[
                  { required: true, message: '请输入用户名' },
                  ...(register
                    ? [
                      {
                        pattern: /^[a-zA-Z][a-zA-Z0-9_]{2,31}$/,
                        message: '3–32 位，字母开头，可使用字母、数字和下划线',
                      },
                    ]
                    : []),
                ]}
              >
                <Input size="large" prefix={<UserOutlined style={{ color: '#b1b5bd' }} />} placeholder={register ? '设置用户名' : '请输入用户名'} autoComplete="username" maxLength={32} />
              </Form.Item>
              {register && (
              <Form.Item name="nickname" label="昵称" rules={[{ max: 40 }]}>
                <Input size="large" placeholder="怎么称呼你（选填）" autoComplete="nickname" maxLength={40} />
              </Form.Item>
              )}
              <Form.Item
                name="password"
                label="密码"
                rules={[
                  { required: true, message: '请输入密码' },
                  ...(register
                    ? [{ min: 10, max: 128, message: '密码长度为 10–128 位' }]
                    : []),
                ]}
              >
                <Input.Password
                  size="large"
                  prefix={<LockOutlined style={{ color: '#b1b5bd' }} />}
                  placeholder={register ? '设置密码，至少 10 位' : '请输入密码'}
                  autoComplete={register ? 'new-password' : 'current-password'}
                  maxLength={128}
                />
              </Form.Item>
              <Button type="primary" htmlType="submit" block loading={busy}>
                {register ? '注册' : '登录'}
              </Button>
            </Form>
            <div className="entry-switch">
              <span style={{ color: '#9095a0' }}>
                {register ? '已有账户？' : '还没有账户？'}
                {' '}
              </span>
              <Link href={register ? '/login' : '/register'}>
                {register ? '立即登录' : '免费注册'}
              </Link>
            </div>
            {!register && (
            <Typography.Paragraph
              type="secondary"
              style={{ marginTop: 16, marginBottom: 0 }}
            >
              忘记密码请联系管理员重置。
            </Typography.Paragraph>
            )}
          </section>
        </div>
        <div className="entry-footnote">木风同学的投资小站 · 记录、观察、思考</div>
      </main>
    </ConfigProvider>
  );
}
