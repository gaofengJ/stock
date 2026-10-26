'use client';

/* eslint-disable no-restricted-syntax, no-await-in-loop -- Restore each IndexedDB draft in order and preserve existing entries. */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Alert, Button, Card, ConfigProvider, Space, Upload,
} from 'antd';
import AccountBoundary, { useAccount } from '@/auth/Boundary';
import { allLocalNotebooks, restoreMissingNotebook } from '@/app/review/local-notebook';
import {
  parseTransfer, storageOwner, transferablePreference, transferSchema,
} from '@/discovery/transfer';
import { siteUrl } from '@/discovery/site';
import { useSiteTheme } from '@/components/SiteTheme';

function ImportDrafts() {
  const { user } = useAccount(); const [notice, setNotice] = useState('');
  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <p>先在旧地址下载恢复文件，再用原账号登录此处导入。恢复只写入本机，不会覆盖已有草稿或服务器记录。</p>
      <a href="https://14.103.103.4/domain-transfer/" target="_blank" rel="noreferrer">打开旧地址，下载本机草稿</a>
      <Upload
        accept=".json"
        showUploadList={false}
        beforeUpload={async (file) => {
          try {
            if (!user || user.guest) throw Error('请使用原账号登录后恢复');
            if (file.size > 25000000) throw Error('恢复文件超过 25 MB');
            const data = parseTransfer(await file.text());
            let restored = 0;
            let skipped = 0;
            let other = 0;
            // Deliberately preserve the original notes and links. URL normalization
            // happens in exported public material, not in the recovery archive.
            data.storage.forEach((row) => {
              const owner = storageOwner(row.key);
              if (owner && owner !== user.id) { other += 1; return; }
              if (localStorage.getItem(row.key) !== null) { skipped += 1; return; }
              localStorage.setItem(row.key, row.value); restored += 1;
            });
            for (const row of data.notebooks) {
              if (Number(row.key.split(':')[0]) !== user.id) other += 1;
              else if (await restoreMissingNotebook(row.key, row.value)) restored += 1; else skipped += 1;
            }
            setNotice(`已恢复 ${restored} 项，保留本机已有内容 ${skipped} 项，跳过其他账号内容 ${other} 项。进入对应日期复盘核对后保存。`);
          } catch (error) { setNotice(error instanceof Error ? error.message : '恢复失败，文件与旧草稿均已保留，可重试'); }
          return false;
        }}
      >
        <Button type="primary">选择恢复文件</Button>
      </Upload>
      {notice && <Alert message={notice} type="info" />}
      <Link href="/review/">返回每日复盘</Link>
    </Space>
  );
}

export default function DomainTransfer() {
  const { themeConfig } = useSiteTheme();
  const [legacy, setLegacy] = useState<boolean | null>(null); const [notice, setNotice] = useState('');
  useEffect(() => { setLegacy(['14.103.103.4', '47.99.111.167'].includes(window.location.hostname)); }, []);
  return (
    <ConfigProvider theme={themeConfig}>
      <main style={{ maxWidth: 760, margin: '48px auto', padding: 20 }}>
        <Card title="恢复旧地址的本机草稿">
          {legacy === true && (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <p>网站已迁至正式域名。原 IP 下未保存的复盘、待收录素材和 AI 输入仍在当前浏览器中，可下载后到正式域名恢复。</p>
            <Alert type="info" message="恢复文件可能含私人记录，请仅保存在自己的设备上。文件不会上传到服务器，原草稿也不会删除。" />
            <Button
              type="primary"
              onClick={async () => {
                try {
                  const storage = Object.keys(localStorage).filter((key) => storageOwner(key) || transferablePreference(key)).map((key) => ({ key, value: localStorage.getItem(key)! }));
                  const notebooks = await allLocalNotebooks();
                  const data = { schema: transferSchema, storage, notebooks };
                  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'stock-local-drafts.json'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
                  setNotice(`已下载 ${notebooks.length} 份复盘草稿和 ${storage.length} 项本机资料。请到正式域名使用原账号导入。`);
                } catch { setNotice('本机存储暂时不可读，请保留此浏览器并重试，未删除任何内容'); }
              }}
            >
              下载旧地址本机草稿
            </Button>
            {notice && <Alert type="info" message={notice} />}
            <a href={`${siteUrl}/domain-transfer/`}>前往正式域名恢复</a>
          </Space>
          )}
          {legacy === false && <AccountBoundary><ImportDrafts /></AccountBoundary>}
        </Card>
      </main>
    </ConfigProvider>
  );
}
