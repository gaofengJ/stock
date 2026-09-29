'use client';

import { errorMessage } from '@/api/errors';
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  Tag,
  message,
} from 'antd';
import { UserOutlined, SafetyCertificateOutlined, LogoutOutlined } from '@ant-design/icons';
import CommonLayout from '@/components/Layout';
import AccountAvatar from '@/auth/AccountAvatar';
import AvatarPicker from '@/auth/AvatarPicker';
import PageHeading from '@/auth/PageHeading';
import { useAccount } from '@/auth/Boundary';
import { api, clearCredential } from '@/auth/client';
import { useState } from 'react';

export default function Page() {
  const { user, refresh, logout } = useAccount();
  const [saving, setSaving] = useState(false);
  const [changing, setChanging] = useState(false);
  const report = (e: unknown) => message.error(errorMessage(e));
  if (!user) return null;
  return (
    <CommonLayout headerMenuActive="" asideMenuActive="/profile" asideMenuItems={[{ key: '/profile', icon: <UserOutlined />, label: '个人中心' }]}>
      <main className="account-page">
        <PageHeading title="个人中心" description="管理个人资料与账户安全。" icon={<UserOutlined />} />
        {user.mustChangePassword && (
        <Alert
          type="warning"
          showIcon
          message="管理员已重置密码，请修改后再访问业务模块。"
          style={{ marginBottom: 20 }}
        />
        )}
        <div className="profile-grid">
          <aside className="account-surface profile-summary">
            <AccountAvatar avatar={user.avatar} roles={user.roles} size={88} />
            <AvatarPicker />
            <h2>{user.nickname || user.username}</h2>
            <p>
              @
              {user.username}
            </p>
            <div>{user.roles.map((r) => <Tag key={r.id} className="brand-tag">{r.name}</Tag>)}</div>
            <div className="profile-note">
              7种颜色 · 4种款式 · 自由选择
              <br />
              让每次相遇都有熟悉的模样
            </div>
            <Button icon={<LogoutOutlined />} style={{ marginTop: 20 }} onClick={() => logout().catch(report)}>退出登录</Button>
          </aside>
          <section className="profile-forms">
            {!user.mustChangePassword && (
            <Card
              className="profile-card"
              title={(
                <span>
                  <UserOutlined />
                  {' '}
                  基本资料
                </span>
)}
            >
              <p className="profile-caption">昵称用于站内显示，用户名作为登录凭据保留。</p>
              <Form
                layout="vertical"
                initialValues={{ nickname: user.nickname }}
                onFinish={async (v) => {
                  setSaving(true);
                  try {
                    await api('/users/me', 'PATCH', v);
                    await refresh();
                    message.success('资料已保存');
                  } catch (e) {
                    report(e);
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                <Form.Item
                  name="nickname"
                  label="昵称"
                  rules={[{ required: true, min: 1, max: 40 }]}
                >
                  <Input maxLength={40} placeholder="输入你的昵称" />
                </Form.Item>
                <Button htmlType="submit" type="primary" loading={saving}>
                  保存资料
                </Button>
              </Form>
            </Card>
            )}
            <Card
              className="profile-card"
              title={(
                <span>
                  <SafetyCertificateOutlined />
                  {' '}
                  账户安全
                </span>
)}
            >
              <p className="profile-caption">修改密码后，所有设备都需要重新登录。</p>
              <Form
                layout="vertical"
                onFinish={async ({ currentPassword, newPassword }) => {
                  setChanging(true);
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
                  } finally {
                    setChanging(false);
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
                <Button htmlType="submit" type="primary" loading={changing}>
                  更新密码
                </Button>
              </Form>
            </Card>
          </section>
        </div>
      </main>
    </CommonLayout>
  );
}
