'use client';

import { InteractionButton } from '@/components/Interaction';

import {
  useCallback, useEffect, useRef, useState,
} from 'react';
import {
  Badge, Button, Card, Drawer, Form, Input, List, Modal, Space, Spin, Tag, Typography, message,
} from 'antd';
import { CommentOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import CommonLayout from '@/components/Layout';
import PageHeading from '@/auth/PageHeading';
import { useAccount } from '@/auth/Boundary';
import { useFeedbackNotifications } from '@/auth/FeedbackNotifications';
import { api } from '@/auth/client';
import { errorMessage } from '@/api/errors';

interface Reply {
  id: number; content: string; author: string; createdAt: string; isAdmin: boolean;
}
interface Feedback {
  id: number; content: string; author: string; createdAt: string; updatedAt: string; unread: boolean;
}
interface Detail extends Feedback { replies: Reply[]; throughReplyId: number }
const time = (value: string) => dayjs(value).format('YYYY-MM-DD HH:mm');
const report = (error: unknown) => message.error(errorMessage(error));
const contentRules = [{ required: true, whitespace: true, message: '请填写内容' }, { max: 2000, message: '最多2000个字符' }];

export default function Page() {
  const { user } = useAccount();
  const { refresh: refreshUnread } = useFeedbackNotifications();
  const admin = !!user?.roles.some((role) => role.code === 'admin');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: Feedback[]; total: number }>({ items: [], total: 0 });
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [replying, setReplying] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const detailRequest = useRef(0);
  const [createForm] = Form.useForm();
  const [replyForm] = Form.useForm();

  useEffect(() => {
    let active = true;
    setLoading(true);
    api<{ items: Feedback[]; total: number }>(`/feedback?page=${page}`)
      .then((value) => { if (active) setData(value); })
      .catch((error) => { if (active) report(error); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [page, refreshKey]);

  const loadDetail = useCallback(async (id: number) => {
    detailRequest.current += 1;
    const request = detailRequest.current;
    setDetailLoading(true);
    try {
      const value = await api<Detail>(`/feedback/${id}`);
      if (request !== detailRequest.current) return;
      setDetail(value);
      await api(`/feedback/${id}/read`, 'POST', { throughReplyId: value.throughReplyId });
      await refreshUnread();
      setRefreshKey((key) => key + 1);
    } catch (error) {
      if (request === detailRequest.current) report(error);
    } finally {
      if (request === detailRequest.current) setDetailLoading(false);
    }
  }, [refreshUnread]);

  const openDetail = (id: number) => {
    setSelected(id);
    setDetail(null);
    replyForm.resetFields();
    loadDetail(id);
  };
  const closeDetail = () => {
    if (replying) return;
    detailRequest.current += 1;
    setSelected(null);
    setDetail(null);
  };

  return (
    <CommonLayout headerMenuActive="" showAsideMenu={false}>
      <main className="account-page account-surface">
        <PageHeading title="意见反馈" description={admin ? '查看用户反馈并回复。每条反馈仅提交者与管理员可见。' : '告诉我们你的功能建议或遇到的问题，仅你和管理员可见。'} icon={<CommentOutlined />} />
        <Space style={{ marginBottom: 20 }}>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>提交反馈</Button>
          <Button icon={<ReloadOutlined />} loading={loading} onClick={() => { setRefreshKey((value) => value + 1); refreshUnread(); }}>刷新</Button>
        </Space>
        <List
          loading={loading}
          dataSource={data.items}
          locale={{ emptyText: admin ? '暂无用户反馈' : '还没有反馈，欢迎告诉我们你的想法' }}
          pagination={{
            current: page, pageSize: 20, total: data.total, onChange: setPage, showSizeChanger: false, hideOnSinglePage: true,
          }}
          renderItem={(item) => (
            <List.Item key={item.id} actions={[<InteractionButton intent="preview" key="view" onClick={() => openDetail(item.id)}>查看 / 回复</InteractionButton>]}>
              <List.Item.Meta
                title={(
                  <Typography.Paragraph ellipsis={{ rows: 2 }} style={{ marginBottom: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                    {item.unread && <Badge status="error" text="未读" style={{ marginRight: 8 }} />}
                    {item.content}
                  </Typography.Paragraph>
)}
                description={`${admin ? `${item.author} · ` : ''}最近更新 ${time(item.updatedAt)}`}
              />
            </List.Item>
          )}
        />
      </main>
      <Modal title="提交反馈" open={creating} onCancel={() => { if (!saving) setCreating(false); }} footer={null}>
        <Form
          form={createForm}
          name="create-feedback"
          layout="vertical"
          onFinish={async ({ content }) => {
            setSaving(true);
            try {
              const result = await api<{ id: number }>('/feedback', 'POST', { content: content.trim() });
              createForm.resetFields();
              setCreating(false);
              setPage(1);
              setRefreshKey((value) => value + 1);
              message.success('反馈已提交');
              openDetail(result.id);
            } catch (error) { report(error); } finally { setSaving(false); }
          }}
        >
          <Form.Item name="content" label="功能建议或问题描述" rules={contentRules}>
            <Input.TextArea rows={5} maxLength={2000} showCount placeholder="请描述你的建议或遇到的问题" disabled={saving} />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={saving}>提交</Button>
        </Form>
      </Modal>
      <Drawer title="反馈详情" open={selected !== null} onClose={closeDetail} closable={!replying} maskClosable={!replying} keyboard={!replying} width={560} extra={<Button disabled={!selected || replying} loading={detailLoading} onClick={() => { if (selected) loadDetail(selected); }}>刷新</Button>}>
        <Spin spinning={detailLoading}>
          {detail && (
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              <Card size="small" title={`${detail.author} · ${time(detail.createdAt)}`}>
                <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{detail.content}</div>
              </Card>
              {detail.replies.map((reply) => (
                <Card
                  key={reply.id}
                  size="small"
                  title={(
                    <>
                      <Tag color={reply.isAdmin ? 'blue' : 'default'}>{reply.isAdmin ? '管理员' : '提交者'}</Tag>
                      {reply.author}
                    </>
)}
                >
                  <Typography.Text type="secondary">{time(reply.createdAt)}</Typography.Text>
                  <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', marginTop: 8 }}>{reply.content}</div>
                </Card>
              ))}
              {!detail.replies.length && <Typography.Text type="secondary">暂无回复</Typography.Text>}
              <Form
                form={replyForm}
                name="reply-feedback"
                layout="vertical"
                onFinish={async ({ content }) => {
                  const { id } = detail;
                  setReplying(true);
                  try {
                    await api(`/feedback/${id}/replies`, 'POST', { content: content.trim() });
                    replyForm.resetFields();
                    message.success('回复已发送');
                    setRefreshKey((value) => value + 1);
                    await loadDetail(id);
                  } catch (error) { report(error); } finally { setReplying(false); }
                }}
              >
                <Form.Item name="content" label="回复" rules={contentRules}>
                  <Input.TextArea rows={3} maxLength={2000} showCount disabled={replying} />
                </Form.Item>
                <Button htmlType="submit" type="primary" loading={replying}>发送回复</Button>
              </Form>
            </Space>
          )}
        </Spin>
      </Drawer>
    </CommonLayout>
  );
}
