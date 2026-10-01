'use client';

import {
  useCallback, useEffect, useRef, useState,
} from 'react';
import {
  Alert, Button, Checkbox, DatePicker, Drawer, Empty, Input, Pagination, Segmented, Select, Skeleton, Space, Switch, Tag, Tooltip, message,
} from 'antd';
import {
  ReloadOutlined, SettingOutlined, StarFilled, StarOutlined, ExportOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import CommonLayout from '@/components/Layout';
import { useAccount } from '@/auth/Boundary';
import { api } from '@/auth/client';
import { errorMessage } from '@/api/errors';
import styles from './news.module.scss';

interface NewsItem { id: number; source: string; sourceName: string; kind: string; title: string; body: string; originalUrl: string | null; important: boolean; publishedAt: string; timeBasis: string; favorite: boolean }
interface NewsList { items: NewsItem[]; total: number; updatedAt: string; date: string }
interface Source { code: string; name: string; enabled: boolean; intervalSeconds: number; status: string; lastSuccess: string | null; nextAttempt: string | null; lastError: string; lastAdded: number; availabilityNote?: string }
interface SourceState { collecting: boolean; sources: Source[] }
const chinaDate = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
const formatTime = (date: string | null, full = false) => (date ? new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', ...(full ? { month: '2-digit', day: '2-digit' } : {}), hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
}).format(new Date(date)) : '尚未更新');
const statusText: Record<string, string> = {
  ok: '正常', error: '暂不可用', pending: '等待采集', collecting: '采集中',
};

export default function Page() {
  const { user } = useAccount();
  const manager = Boolean(user?.permissions.includes('news:manage'));
  const signedIn = Boolean(user && !user.guest);
  const [date, setDate] = useState(chinaDate);
  const [source, setSource] = useState('');
  const [kind, setKind] = useState('');
  const [keyword, setKeyword] = useState('');
  const [important, setImportant] = useState(false);
  const [favorites, setFavorites] = useState(false);
  const [page, setPage] = useState(1);
  const [auto, setAuto] = useState(true);
  const [data, setData] = useState<NewsList | null>(null);
  const [sources, setSources] = useState<SourceState>({ collecting: false, sources: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sourceError, setSourceError] = useState('');
  const [settings, setSettings] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<NewsItem | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [favoriteBusy, setFavoriteBusy] = useState<number | null>(null);
  const [configBusy, setConfigBusy] = useState('');
  const [syncBusy, setSyncBusy] = useState(false);
  const request = useRef(0);
  const detailRequest = useRef(0);
  const pending = useRef(false);

  const loadSources = useCallback(async () => {
    try { setSources(await api<SourceState>('/news/sources')); setSourceError(''); } catch (e) { setSourceError(errorMessage(e)); }
  }, []);
  const load = useCallback(async (quiet = false) => {
    const current = request.current + 1; request.current = current;
    if (!quiet) setLoading(true);
    pending.current = true;
    const params = new URLSearchParams({ page: String(page), pageSize: '20' });
    if (!favorites) params.set('date', date);
    if (source) params.set('source', source);
    if (kind) params.set('kind', kind);
    if (keyword) params.set('keyword', keyword);
    if (important) params.set('important', 'true');
    if (favorites) params.set('favorites', 'true');
    try {
      const result = await api<NewsList>(`/news?${params}`);
      if (current === request.current) {
        setData(result); setError('');
        const lastPage = Math.max(1, Math.ceil(result.total / 20));
        if (page > lastPage) setPage(lastPage);
      }
    } catch (e) { if (current === request.current) setError(errorMessage(e)); } finally { if (current === request.current) { setLoading(false); pending.current = false; } }
  }, [date, source, kind, keyword, important, favorites, page]);
  useEffect(() => {
    setData(null); load();
    return () => { request.current += 1; pending.current = false; };
  }, [load]);
  useEffect(() => { loadSources(); }, [loadSources]);
  useEffect(() => {
    const refresh = () => {
      if (!auto || document.hidden || pending.current) return;
      loadSources();
      if (page === 1 && !favorites) load(true);
    };
    const timer = window.setInterval(refresh, 30000);
    document.addEventListener('visibilitychange', refresh);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, [auto, load, loadSources, page, favorites]);
  useEffect(() => () => { detailRequest.current += 1; }, []);
  const openDetail = async (item: NewsItem) => {
    const current = detailRequest.current + 1; detailRequest.current = current;
    setDetailOpen(true); setDetail(item); setDetailLoading(true); setDetailError('');
    try { const result = await api<NewsItem>(`/news/${item.id}`); if (current === detailRequest.current) setDetail(result); } catch (e) { if (current === detailRequest.current) setDetailError(errorMessage(e)); } finally { if (current === detailRequest.current) setDetailLoading(false); }
  };
  const favorite = async (item: NewsItem) => {
    if (!signedIn || favoriteBusy !== null) return;
    setFavoriteBusy(item.id);
    try {
      const result = await api<{ favorite: boolean }>(`/news/${item.id}/favorite`, item.favorite ? 'DELETE' : 'POST');
      setData((prev) => (prev ? { ...prev, items: prev.items.map((n) => (n.id === item.id ? { ...n, favorite: result.favorite } : n)) } : prev));
      setDetail((prev) => (prev?.id === item.id ? { ...prev, favorite: result.favorite } : prev));
      if (favorites) load(true);
    } catch (e) { message.error(errorMessage(e)); } finally { setFavoriteBusy(null); }
  };
  const updateSource = async (item: Source, value: Record<string, unknown>) => {
    setConfigBusy(item.code);
    try { setSources(await api<SourceState>(`/news/sources/${item.code}`, 'PATCH', value)); message.success('来源配置已保存'); } catch (e) { message.error(errorMessage(e)); } finally { setConfigBusy(''); }
  };
  const sync = async () => {
    setSyncBusy(true);
    try { const result = await api<{ message: string }>('/news/sync', 'POST'); message.success(result.message); loadSources(); } catch (e) { message.error(errorMessage(e)); } finally { setSyncBusy(false); }
  };
  const failed = sources.sources.filter((s) => s.enabled && s.status === 'error');
  const successful = sources.sources.filter((s) => s.enabled && s.status === 'ok').length;
  let emptyText = '当天暂无资讯，采集后将在这里显示，也可选择其他日期';
  if (source || keyword || important) emptyText = '当前筛选条件下暂无资讯';
  if (favorites) emptyText = '暂无收藏，点击资讯旁的星标即可收藏';
  const favoriteTitle = (item: NewsItem) => {
    if (!signedIn) return '登录后可收藏资讯';
    return item.favorite ? '取消收藏' : '收藏资讯';
  };
  const sourceColor = (s: Source) => {
    if (!s.enabled) return 'default';
    return { ok: 'green', error: 'orange' }[s.status] || 'blue';
  };
  const favoriteButton = (item: NewsItem) => (
    <Tooltip title={favoriteTitle(item)}>
      <Button type="text" aria-label={item.favorite ? '取消收藏' : '收藏资讯'} disabled={!signedIn || favoriteBusy !== null} loading={favoriteBusy === item.id} icon={item.favorite ? <StarFilled className={styles.star} /> : <StarOutlined />} onClick={() => favorite(item)} />
    </Tooltip>
  );
  return (
    <CommonLayout headerMenuActive="/news" showAsideMenu={false}>
      <main className={styles.news}>
        <div className={styles.heading}>
          <div>
            <h1>实时资讯</h1>
            <p>市场快讯与财经报道 · 持续采集，按发布时间排序</p>
          </div>
          <Space wrap>
            <span className={styles.auto}>
              <Switch size="small" checked={auto} onChange={setAuto} aria-label="自动刷新资讯" />
              {' '}
              自动刷新
            </span>
            <Button icon={<ReloadOutlined />} loading={loading} onClick={() => { load(); loadSources(); }}>刷新</Button>
            <Button icon={<SettingOutlined />} onClick={() => setSettings(true)}>{manager ? '来源管理' : '来源状态'}</Button>
          </Space>
        </div>
        <div className={styles.filters}>
          <Segmented value={kind} options={[{ label: '全部资讯', value: '' }, { label: '快讯', value: 'flash' }, { label: '报道', value: 'article' }]} onChange={(v) => { setKind(String(v)); setPage(1); }} />
          <Select aria-label="资讯来源" showSearch optionFilterProp="label" value={source} className={styles.sourceSelect} options={[{ label: '全部来源', value: '' }, ...sources.sources.map((s) => ({ label: s.name, value: s.code }))]} onChange={(v) => { setSource(v); setPage(1); }} />
          <DatePicker aria-label="资讯日期" allowClear={false} disabled={favorites} value={dayjs(date)} disabledDate={(d) => d.format('YYYY-MM-DD') > chinaDate()} onChange={(d) => { if (d) { setDate(d.format('YYYY-MM-DD')); setPage(1); } }} />
          <Input.Search placeholder="搜索标题或正文" aria-label="搜索资讯" allowClear maxLength={80} className={styles.search} onSearch={(v) => { setKeyword(v.trim()); setPage(1); }} />
          <Checkbox checked={important} onChange={(e) => { setImportant(e.target.checked); setPage(1); }}>仅重点</Checkbox>
          <Tooltip title={signedIn ? '查看个人收藏，覆盖所有日期' : '登录后可查看收藏'}><Button disabled={!signedIn} type={favorites ? 'primary' : 'default'} icon={<StarOutlined />} onClick={() => { setFavorites(!favorites); setPage(1); }}>{favorites ? '我的收藏' : '收藏'}</Button></Tooltip>
        </div>
        <div className={styles.summary}>
          <span>
            {favorites ? '我的收藏 · 所有日期' : `${date} · 北京时间`}
            {' '}
            · 共
            {' '}
            {data?.total ?? '—'}
            {' '}
            条
            {keyword ? ` · 关键词：${keyword}` : ''}
          </span>
          <span>
            {successful}
            {' '}
            个来源正常
            {` · 共 ${sources.sources.length} 个订阅入口`}
            {data ? ` · 页面更新 ${formatTime(data.updatedAt)}` : ''}
            {auto && page === 1 && !favorites ? ' · 每 30 秒刷新' : ' · 自动更新列表已暂停'}
          </span>
        </div>
        {failed.length > 0 && <Alert className={styles.alert} type="warning" showIcon message={`${failed.map((s) => s.name).join('、')}暂不可用，已采集的资讯仍可查看，系统会自动重试。`} action={<Button size="small" onClick={() => setSettings(true)}>查看状态</Button>} />}
        {error && <Alert className={styles.alert} type="error" showIcon message={error} description={data ? '当前显示上次成功加载的资讯。' : undefined} action={<Button size="small" onClick={() => load()}>重试</Button>} />}
        <section className={styles.list} aria-label="资讯列表" aria-busy={loading}>
          {loading && !data ? <div className={styles.skeleton}><Skeleton active paragraph={{ rows: 5 }} /></div> : null}
          {!loading && !data?.items.length && !error ? <Empty className={styles.empty} description={emptyText} /> : null}
          {data?.items.map((item) => (
            <article key={item.id} className={`${styles.item} ${item.important ? styles.important : ''}`}>
              <time dateTime={item.publishedAt}>
                {formatTime(item.publishedAt)}
                {item.timeBasis === 'collected' && <small>采集时间</small>}
                {favorites ? <small>{dayjs(item.publishedAt).format('MM-DD')}</small> : null}
              </time>
              <div className={styles.itemContent}>
                <div className={styles.meta}>
                  <Tag>{item.sourceName}</Tag>
                  <span>{item.kind === 'flash' ? '快讯' : '报道'}</span>
                  {item.important && <Tag color="red">重点</Tag>}
                </div>
                <button type="button" className={styles.title} onClick={() => openDetail(item)}>{item.title}</button>
                {item.body && item.body !== item.title && <p className={styles.preview}>{item.body}</p>}
                <div className={styles.actions}>
                  <Button size="small" type="link" onClick={() => openDetail(item)}>查看详情</Button>
                  {item.originalUrl && (
                  <a href={item.originalUrl} target="_blank" rel="noopener noreferrer">
                    阅读原文
                    <ExportOutlined />
                  </a>
                  )}
                </div>
              </div>
              {favoriteButton(item)}
            </article>
          ))}
        </section>
        {Boolean(data?.total) && <div className={styles.pagination}><Pagination current={page} pageSize={20} total={data?.total} showSizeChanger={false} showLessItems onChange={setPage} /></div>}
        <p className={styles.note}>资讯来自各来源公开内容，采集和刷新可能存在延迟。来源未提供有效发布时间时，以首次采集时间展示并标注。重点标记来自各来源的重点快讯。雪球内容为用户讨论。报道以原文为准。</p>
      </main>
      <Drawer title="资讯详情" width="min(640px, 100vw)" open={detailOpen} onClose={() => { setDetailOpen(false); detailRequest.current += 1; }}>
        {detail && (
        <div className={styles.detail}>
          <Space wrap>
            <Tag>{detail.sourceName}</Tag>
            <span>
              {formatTime(detail.publishedAt, true)}
              {detail.timeBasis === 'collected' ? ' · 采集时间' : ''}
              {' '}
              北京时间
            </span>
            {detail.important && <Tag color="red">重点</Tag>}
            {favoriteButton(detail)}
          </Space>
          <h2>{detail.title}</h2>
          {detailError && <Alert type="error" message={detailError} action={<Button size="small" onClick={() => openDetail(detail)}>重试</Button>} />}
          {detailLoading ? <Skeleton active /> : <p className={styles.body}>{detail.body || '请前往原文阅读完整内容。'}</p>}
          {detail.originalUrl && <Button href={detail.originalUrl} target="_blank" rel="noopener noreferrer" icon={<ExportOutlined />}>阅读原文</Button>}
        </div>
        )}
      </Drawer>
      <Drawer title={manager ? '资讯来源管理' : '资讯来源状态'} width="min(560px, 100vw)" open={settings} onClose={() => setSettings(false)}>
        <p className={styles.note}>来源在后台定时采集。不可用时保留已有资讯，并逐步延长重试间隔。</p>
        {sourceError && <Alert type="error" message={sourceError} />}
        <Space className={styles.sourceTools}>
          <Button onClick={loadSources} icon={<ReloadOutlined />}>刷新状态</Button>
          {manager && <Button loading={syncBusy} onClick={sync}>立即采集</Button>}
        </Space>
        {sources.sources.map((s) => (
          <section key={s.code} className={styles.sourceCard}>
            <div className={styles.sourceTitle}>
              <strong>{s.name}</strong>
              <Space>
                <Tag color={sourceColor(s)}>{!s.enabled ? '未启用' : statusText[s.status] || '等待采集'}</Tag>
                {manager && <Switch aria-label={`启用${s.name}`} checked={s.enabled} loading={configBusy === s.code} disabled={Boolean(configBusy)} onChange={(v) => updateSource(s, { enabled: v })} />}
              </Space>
            </div>
            <p>
              最近成功：
              {formatTime(s.lastSuccess, true)}
              <br />
              最近新增：
              {s.lastAdded}
              {' '}
              条
              {s.enabled && s.nextAttempt ? (
                <>
                  <br />
                  下次采集：
                  {formatTime(s.nextAttempt, true)}
                </>
              ) : null}
            </p>
            {s.lastError && <Alert showIcon type="warning" message={s.lastError} />}
            {s.availabilityNote && <p className={styles.note}>{s.availabilityNote}</p>}
            {s.code === 'bloomberg' && <p className={styles.note}>境外来源的可用性取决于服务器网络和来源访问限制。</p>}
            {manager && (
            <div className={styles.interval}>
              采集间隔
              <Select aria-label={`${s.name}采集间隔`} value={s.intervalSeconds} disabled={Boolean(configBusy)} options={[60, 120, 300, 600, 1800, 3600].map((n) => ({ value: n, label: `${n / 60} 分钟` }))} onChange={(v) => updateSource(s, { intervalSeconds: v })} />
            </div>
            )}
          </section>
        ))}
      </Drawer>
    </CommonLayout>
  );
}
