'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Alert, Button, Card, Form, Input, Typography, message,
} from 'antd';
import { useRouter } from 'next/navigation';
import { api } from './client';
import { useAccount } from './Boundary';

export default function Entry({ register = false }: { register?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const { refresh } = useAccount();
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: '#f6f7fb',
        padding: 24,
      }}
    >
      <Card style={{ width: '100%', maxWidth: 440 }}>
        <Typography.Title level={3}>
          {register ? '创建账户' : '登录木风小站'}
        </Typography.Title>
        <Typography.Paragraph type="secondary">
          {register
            ? '注册后即可查看业务模块，无需邀请码。'
            : '登录后查看市场数据与个人账户。'}
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
            <Input autoComplete="username" maxLength={32} />
          </Form.Item>
          {register && (
            <Form.Item name="nickname" label="昵称" rules={[{ max: 40 }]}>
              <Input autoComplete="nickname" />
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
              autoComplete={register ? 'new-password' : 'current-password'}
              maxLength={128}
            />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={busy}>
            {register ? '注册' : '登录'}
          </Button>
        </Form>
        <div style={{ marginTop: 20 }}>
          <Link href={register ? '/login' : '/register'}>
            {register ? '已有账户，去登录' : '没有账户，自主注册'}
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
      </Card>
    </main>
  );
}
