'use client';

import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  Space,
  Tag,
  Typography,
  message,
} from 'antd';
import Link from 'next/link';
import { useAccount } from '@/auth/Boundary';
import { api, clearCredential, homePath } from '@/auth/client';

export default function Page() {
  const { user, refresh, logout } = useAccount();
  const report = (e: unknown) => message.error((e as Error).message);
  if (!user) return null;
  return (
    <main style={{ maxWidth: 760, margin: '40px auto', padding: 24 }}>
      <Space style={{ marginBottom: 24 }}>
        <Link href={homePath(user)}>返回首页</Link>
        <Button onClick={() => logout().catch(report)}>退出登录</Button>
      </Space>
      <Typography.Title level={2}>个人中心</Typography.Title>
      <Typography.Paragraph>
        {user.username}
        {' '}
        {user.roles.map((r) => (
          <Tag key={r.id}>{r.name}</Tag>
        ))}
      </Typography.Paragraph>
      {user.mustChangePassword && (
        <Alert
          type="warning"
          showIcon
          message="管理员已重置密码，请修改后再访问业务模块。"
          style={{ marginBottom: 20 }}
        />
      )}
      {!user.mustChangePassword && (
        <Card title="基本资料" style={{ marginBottom: 20 }}>
          <Form
            layout="vertical"
            initialValues={{ nickname: user.nickname }}
            onFinish={async (v) => {
              try {
                await api('/users/me', 'PATCH', v);
                await refresh();
                message.success('资料已保存');
              } catch (e) {
                report(e);
              }
            }}
          >
            <Form.Item
              name="nickname"
              label="昵称"
              rules={[{ required: true, min: 1, max: 40 }]}
            >
              <Input />
            </Form.Item>
            <Button htmlType="submit" type="primary">
              保存资料
            </Button>
          </Form>
        </Card>
      )}
      <Card title="修改密码">
        <Form
          layout="vertical"
          onFinish={async ({ currentPassword, newPassword }) => {
            try {
              await api('/auth/password', 'PATCH', {
                currentPassword,
                newPassword,
              });
              clearCredential();
              message.success('密码已修改，请重新登录');
              window.location.replace('/login/');
            } catch (e) {
              report(e);
            }
          }}
        >
          <Form.Item
            name="currentPassword"
            label="原密码"
            rules={[{ required: true }]}
          >
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Form.Item
            name="newPassword"
            label="新密码"
            rules={[{ required: true, min: 10, max: 128 }]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Form.Item
            name="confirm"
            label="确认新密码"
            dependencies={['newPassword']}
            rules={[
              { required: true },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  return value === getFieldValue('newPassword')
                    ? Promise.resolve()
                    : Promise.reject(new Error('两次密码不一致'));
                },
              }),
            ]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Button htmlType="submit" type="primary">
            修改密码并退出所有会话
          </Button>
        </Form>
      </Card>
    </main>
  );
}
