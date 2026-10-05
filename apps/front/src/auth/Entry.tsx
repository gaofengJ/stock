'use client';

import { errorMessage } from '@/api/errors';
import { useEffect, useRef, useState } from 'react';
import type { InputRef } from 'antd';
import Link from 'next/link';
import {
  Alert, Button, ConfigProvider, Form, Input, Typography, message,
} from 'antd';
import {
  ArrowRightOutlined, BarChartOutlined, FundOutlined, ReadOutlined, UserOutlined, LockOutlined,
} from '@ant-design/icons';
import { ThemeToggle, useSiteTheme } from '@/components/SiteTheme';
import ImgFengye from '@/assets/imgs/fengye.png';
import { useRouter } from 'next/navigation';
import { api } from './client';
import { useAccount } from './Boundary';

export default function Entry({ register = false }: { register?: boolean }) {
  const { themeConfig } = useSiteTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [form] = Form.useForm();
  const usernameInput = useRef<InputRef>(null);
  useEffect(() => {
    if (!busy && form.getFieldError('username').length) usernameInput.current?.focus();
  }, [busy, form]);
  const router = useRouter();
  const {
    refresh, user, trialRemaining, trialExpired,
  } = useAccount();
  return (
    <ConfigProvider theme={themeConfig}>
      <main className="entry-page">
        <div className="entry-header">
          <Link href="/" className="entry-brand">
            <img src={ImgFengye.src} alt="" />
            木风同学的投资小站
          </Link>
          <ThemeToggle />
        </div>
        <div className="entry-shell">
          <section className="entry-intro">
            <div className="entry-eyebrow">行情 · 选股 · 复盘</div>
            <h1>
              看清市场变化，
              <br />
              记录每一次思考。
            </h1>
            <p>看市场涨跌、筛选关注的股票，再用每日复盘整理自己的投资思路。</p>
            <div className="entry-features" aria-label="站内功能介绍">
              <div className="entry-feature">
                <BarChartOutlined />
                <div>
                  <strong>市场概览</strong>
                  <span>主要指数、成交额与涨跌分布，集中查看。</span>
                </div>
              </div>
              <div className="entry-feature">
                <FundOutlined />
                <div>
                  <strong>策略选股</strong>
                  <span>按条件筛选股票，缩小研究范围。</span>
                </div>
              </div>
              <div className="entry-feature">
                <ReadOutlined />
                <div>
                  <strong>每日复盘</strong>
                  <span>阅读复盘与投资记录，回看市场变化。</span>
                </div>
              </div>
            </div>
            {!trialExpired && (
              <div className="entry-preview">
                <Link href="/analysis/overview" className="entry-preview-link">
                  {user?.guest && trialRemaining > 0 ? '继续游客体验' : '先看看市场概览'}
                  <ArrowRightOutlined />
                </Link>
                <span>{user?.guest && trialRemaining > 0 ? '体验结束后，登录或免费注册即可继续。' : '无需注册，可体验 5 分钟。'}</span>
              </div>
            )}
          </section>
          <section className="entry-form">
            <h2>{register ? '免费创建账户' : '欢迎回来'}</h2>
            <Typography.Paragraph type="secondary">
              {register
                ? '注册后即可持续浏览行情、选股与复盘内容。'
                : '登录后，继续查看行情与复盘内容。'}
            </Typography.Paragraph>
            {trialExpired && <Alert type="info" showIcon message="5 分钟游客体验已结束，登录或免费注册后即可继续浏览。" className="entry-alert" />}
            {error && (
            <Alert
              type="error"
              message={error}
              showIcon
              className="entry-alert"
            />
            )}
            <Form
              form={form}
              name={register ? 'register' : 'login'}
              layout="vertical"
              disabled={busy}
              requiredMark={false}
              onValuesChange={(changed) => {
                setError('');
                if ('username' in changed) form.setFields([{ name: 'username', errors: [] }]);
              }}
              onFinish={async (values) => {
                setBusy(true);
                setError('');
                try {
                  await api(
                    register ? '/auth/register' : '/auth/login',
                    'POST',
                    {
                      ...values,
                      username: values.username.trim().toLowerCase(),
                      ...(register ? { nickname: values.nickname?.trim() || undefined } : {}),
                    },
                    false,
                  );
                  if (register) message.success('注册成功，已自动登录');
                  await refresh();
                  router.replace('/');
                } catch (e) {
                  const detail = errorMessage(e);
                  if (register && /^(用户名|该用户名)/.test(detail)) {
                    form.setFields([{ name: 'username', errors: [detail === '用户名不可用' ? '该用户名不可使用，请更换一个用户名' : detail] }]);
                  } else {
                    setError(detail);
                  }
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Form.Item
                name="username"
                label="用户名"
                extra={register ? '用于登录，3–32 位，以字母开头，可含数字和下划线；不区分大小写。' : undefined}
                rules={[
                  { required: true, whitespace: true, message: '请输入用户名' },
                  ...(register
                    ? [
                      {
                        pattern: /^[a-zA-Z][a-zA-Z0-9_]{2,31}$/,
                        transform: (value: string) => value?.trim(),
                        message: '3–32 位，字母开头，可使用字母、数字和下划线',
                      },
                    ]
                    : []),
                ]}
              >
                <Input ref={usernameInput} size="large" prefix={<UserOutlined style={{ color: 'var(--text-disabled)' }} />} placeholder={register ? '例如：mufeng_reader' : '请输入用户名'} autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={register ? 32 : 64} />
              </Form.Item>
              {register && (
              <Form.Item name="nickname" label="昵称（选填）" extra="用于展示，可与他人同名；不填则使用用户名。" rules={[{ max: 40, message: '昵称最多 40 个字符' }]}>
                <Input size="large" placeholder="怎么称呼你" autoComplete="nickname" maxLength={40} />
              </Form.Item>
              )}
              <Form.Item
                name="password"
                label="密码"
                extra={register ? '10–128 个字符，建议组合使用字母、数字和符号。' : undefined}
                rules={[
                  { required: true, message: '请输入密码' },
                  ...(register
                    ? [{ min: 10, max: 128, message: '密码长度为 10–128 位' }]
                    : []),
                ]}
              >
                <Input.Password
                  size="large"
                  prefix={<LockOutlined style={{ color: 'var(--text-disabled)' }} />}
                  placeholder={register ? '设置密码，至少 10 位' : '请输入密码'}
                  autoComplete={register ? 'new-password' : 'current-password'}
                  maxLength={128}
                />
              </Form.Item>
              <Button type="primary" htmlType="submit" block loading={busy}>
                {register ? '免费注册' : '登录'}
              </Button>
              {register && <p className="entry-submit-note">无需邀请码，注册成功后自动登录。</p>}
            </Form>
            <div className="entry-switch">
              <span className="entry-switch-label">
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
