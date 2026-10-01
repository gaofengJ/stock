'use client';

import {
  useCallback, useEffect, useRef, useState,
} from 'react';
import {
  Alert, Button, Checkbox, DatePicker, Drawer, Empty, Input, Pagination, Segmented, Select, Skeleton, Space, Switch, Tag, Tooltip, message,
} from 'antd';
import {
  ReloadOutlined, SettingOutlined, ExportOutlined, InfoCircleOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import CommonLayout from '@/components/Layout';
import { useAccount } from '@/auth/Boundary';
import { api, allowedPath } from '@/auth/client';
import { errorMessage } from '@/api/errors';
import styles from './news.module.scss';
import FocusDrawer, { NewsPreferences } from './FocusDrawer';

interface NewsItem { id: number; source: string; sourceName: string; kind: string; title: string; body: string; originalUrl: string | null; important: boolean; publishedAt: string; timeBasis: string; read: boolean; stocks: { tsCode: string; name: string }[]; related: { id: number; source: string; title: string; originalUrl: string | null }[]; translation?: { title: string; body: string; engine: string; model: string } | null }
interface NewsList { items: NewsItem[]; total: number; updatedAt: string; date: string; latestId: number; newCount: number }
interface Source { code: string; name: string; enabled: boolean; intervalSeconds: number; status: string; lastSuccess: string | null; nextAttempt: string | null; lastError: string; lastAdded: number; availabilityNote?: string; description?: string }
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
  const [configBusy, setConfigBusy] = useState('');
  const [syncBusy, setSyncBusy] = useState(false);
  const [range, setRange] = useState('today');
  const [merge, setMerge] = useState(true);
  const [stock, setStock] = useState('');
  const [watchlist, setWatchlist] = useState(false);
  const [following, setFollowing] = useState(false);
  const [focusOpen, setFocusOpen] = useState(false);
  const [preferences, setPreferences] = useState<NewsPreferences>({ keywords: [], stocks: [] });
  const [readIds, setReadIds] = useState<number[]>([]);
  const [newCount, setNewCount] = useState(0);
  const [newAfter, setNewAfter] = useState<number | null>(null);
  const latestId = useRef<number | null>(null);
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
    params.set('range', range);
    if (range === 'date') params.set('date', date);
    if (merge) params.set('merge', 'true');
    if (stock) params.set('stock', stock);
    if (watchlist && signedIn) params.set('watchlist', 'true');
    if (following && signedIn) params.set('following', 'true');
    if (quiet && latestId.current !== null) params.set('afterId', String(latestId.current));
    if (source) params.set('source', source);
    if (kind) params.set('kind', kind);
    if (keyword) params.set('keyword', keyword);
    if (important) params.set('important', 'true');
    try {
      const result = await api<NewsList>(`/news?${params}`);
      if (current === request.current) {
        setData(result); setError('');
        if (quiet && result.newCount > 0) {
          const previousLatest = latestId.current;
          setNewCount((old) => old + result.newCount);
          setNewAfter((old) => old ?? previousLatest);
        }
        latestId.current = result.latestId;
        const lastPage = Math.max(1, Math.ceil(result.total / 20));
        if (page > lastPage) setPage(lastPage);
      }
    } catch (e) { if (current === request.current) setError(errorMessage(e)); } finally { if (current === request.current) { setLoading(false); pending.current = false; } }
  }, [date, source, kind, keyword, important, page, range, merge, stock, watchlist, following, signedIn]);
  useEffect(() => {
    setData(null); latestId.current = null; setNewCount(0); setNewAfter(null); load();
    return () => { request.current += 1; pending.current = false; };
  }, [load, preferences, user?.id]);
  useEffect(() => { loadSources(); }, [loadSources]);
  useEffect(() => {
    let current = true;
    setPreferences({ keywords: [], stocks: [] }); setReadIds([]); setWatchlist(false); setFollowing(false);
    if (signedIn) api<NewsPreferences>('/news/preferences').then((value) => { if (current) setPreferences(value); }).catch((e) => { if (current) message.error(errorMessage(e)); });
    return () => { current = false; };
  }, [signedIn, user?.id]);
  useEffect(() => {
    const refresh = () => {
      if (!auto || document.hidden || pending.current) return;
      loadSources();
      if (page === 1) load(true);
    };
    const timer = window.setInterval(refresh, 30000);
    document.addEventListener('visibilitychange', refresh);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, [auto, load, loadSources, page]);
  useEffect(() => () => { detailRequest.current += 1; }, []);
  const openDetail = async (item: NewsItem) => {
    const current = detailRequest.current + 1; detailRequest.current = current;
    setDetailOpen(true); setDetail(item); setDetailLoading(true); setDetailError('');
    try {
      const result = await api<NewsItem>(`/news/${item.id}`);
      if (current === detailRequest.current) {
        setDetail(result);
        const ids = [item.id, ...(result.related || []).map((related) => related.id)];
        if (signedIn) await api(`/news/${item.id}/read`, 'POST');
        setReadIds((old) => Array.from(new Set([...old, ...ids])).slice(-2000));
        setData((old) => (old ? { ...old, items: old.items.map((row) => (ids.includes(row.id) ? { ...row, read: true } : row)) } : old));
      }
    } catch (e) { if (current === detailRequest.current) setDetailError(errorMessage(e)); } finally { if (current === detailRequest.current) setDetailLoading(false); }
  };
  const updateSource = async (item: Source, value: Record<string, unknown>) => {
    setConfigBusy(item.code);
    try { setSources(await api<SourceState>(`/news/sources/${item.code}`, 'PATCH', value)); message.success('来源配置已保存'); } catch (e) { message.error(errorMessage(e)); } finally { setConfigBusy(''); }
  };
  const sync = async () => {
    setSyncBusy(true);
    try { const result = await api<{ message: string }>('/news/sync', 'POST'); message.success(result.message); loadSources(); } catch (e) { message.error(errorMessage(e)); } finally { setSyncBusy(false); }
  };
  const availableSources = sources.sources.filter((s) => s.enabled && s.lastSuccess && ['ok', 'collecting'].includes(s.status) && !s.lastError);
  useEffect(() => {
    if (source && !sources.sources.some((s) => s.code === source && s.enabled && s.lastSuccess && ['ok', 'collecting'].includes(s.status) && !s.lastError)) { setSource(''); setPage(1); }
  }, [source, sources]);
  const selectedSource = availableSources.find((s) => s.code === source);
  const sourceTip = selectedSource?.description ? `${selectedSource.name}：${selectedSource.description}` : '市场快讯、财经报道与热门讨论。';
  const rangeText: Record<string, string> = {
    hour: '最近一小时', today: '今天', 'three-days': '最近三天', date,
  };
  const focusMatches = (item: NewsItem) => preferences.keywords.filter((word) => `${item.title}\n${item.body}\n${item.translation?.title || ''}\n${item.translation?.body || ''}`.toLowerCase().includes(word.toLowerCase()));
  const relatedSources = (item: NewsItem) => Array.from(new Set((item.related || []).map((related) => sources.sources.find((s) => s.code === related.source)?.name || related.source)));
  const stockTags = (item: NewsItem) => (item.stocks || []).map((symbol) => (
    <Tag key={symbol.tsCode} color={preferences.stocks.includes(symbol.tsCode) ? 'blue' : 'default'}>
      <button type="button" className={styles.stockLink} aria-label={`筛选${symbol.name}资讯`} onClick={() => { setStock(symbol.tsCode); setPage(1); }}>{symbol.name}</button>
      {allowedPath(user, '/basic/stock') && <a className={styles.stockLink} href={`/basic/stock/?tsCode=${encodeURIComponent(symbol.tsCode)}`} target="_blank" rel="noopener noreferrer" aria-label={`查看${symbol.name}个股信息`}><ExportOutlined /></a>}
    </Tag>
  ));
  let emptyText = '当天暂无资讯，采集后将在这里显示，也可选择其他日期';
  if (source || keyword || important || stock || following || watchlist) emptyText = '当前筛选条件下暂无资讯';
  if (watchlist && !preferences.stocks.length) emptyText = '请在“我的关注”中添加自选股票';
  if (following && !preferences.keywords.length) emptyText = '请在“我的关注”中添加关键词';
  const sourceColor = (s: Source) => {
    if (!s.enabled) return 'default';
    return { ok: 'green', error: 'orange' }[s.status] || 'blue';
  };
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
            <Tooltip title={signedIn ? '管理关注关键词和自选股票' : '登录后保存关注设置'}><Button disabled={!signedIn} onClick={() => setFocusOpen(true)}>我的关注</Button></Tooltip>
            <Button icon={<SettingOutlined />} onClick={() => setSettings(true)}>{manager ? '来源管理' : '来源状态'}</Button>
          </Space>
        </div>
        <div className={styles.filters}>
          <Segmented value={kind} options={[{ label: '全部资讯', value: '' }, { label: '快讯', value: 'flash' }, { label: '报道', value: 'article' }]} onChange={(v) => { setKind(String(v)); setPage(1); }} />
          <Space size={0}>
            <Select aria-label="资讯来源" showSearch optionFilterProp="label" value={source} popupMatchSelectWidth={240} className={styles.sourceSelect} options={[{ label: '全部来源', value: '' }, ...availableSources.map((s) => ({ label: s.name, value: s.code }))]} onChange={(v) => { setSource(v); setPage(1); }} />
            <Tooltip title={sourceTip} trigger={['hover', 'focus', 'click']}>
              <Button type="text" size="small" aria-label="来源内容说明" icon={<InfoCircleOutlined />} />
            </Tooltip>
          </Space>
          <Select aria-label="资讯时间范围" value={range} className={styles.sourceSelect} options={[{ label: '最近一小时', value: 'hour' }, { label: '今天', value: 'today' }, { label: '最近三天', value: 'three-days' }, { label: '指定日期', value: 'date' }]} onChange={(value) => { setRange(value); setPage(1); }} />
          {range === 'date' && <DatePicker aria-label="资讯日期" allowClear={false} value={dayjs(date)} disabledDate={(d) => d.format('YYYY-MM-DD') > chinaDate()} onChange={(d) => { if (d) { setDate(d.format('YYYY-MM-DD')); setPage(1); } }} />}
          <Input.Search placeholder="搜索标题或正文" aria-label="搜索资讯" allowClear maxLength={80} className={styles.search} onSearch={(v) => { setKeyword(v.trim()); setPage(1); }} />
          <Checkbox checked={important} onChange={(e) => { setImportant(e.target.checked); setPage(1); }}>仅重点</Checkbox>
          <Tooltip title="按标题相似度和数字合并，保留各来源。可关闭查看全部。"><Checkbox checked={merge} onChange={(e) => { setMerge(e.target.checked); setPage(1); }}>合并相似</Checkbox></Tooltip>
          <Checkbox disabled={!signedIn} checked={following} onChange={(e) => { setFollowing(e.target.checked); setPage(1); }}>仅关注词</Checkbox>
          <Checkbox disabled={!signedIn} checked={watchlist} onChange={(e) => { setWatchlist(e.target.checked); setPage(1); }}>仅自选股</Checkbox>
        </div>
        {stock && (
        <div className={styles.focusBar}>
          <Tag closable onClose={() => { setStock(''); setPage(1); }}>
            关联股票：
            {stock}
          </Tag>
        </div>
        )}
        {preferences.keywords.length > 0 && (
        <Space wrap className={styles.focusBar}>
          <span>关注词：</span>
          {preferences.keywords.map((word) => <Button size="small" key={word} onClick={() => { setKeyword(word); setPage(1); }}>{word}</Button>)}
        </Space>
        )}
        <div className={styles.summary}>
          <span>
            {`${rangeText[range]} · 北京时间`}
            {' '}
            · 共
            {' '}
            {data?.total ?? '—'}
            {' '}
            条
            {keyword ? ` · 关键词：${keyword}` : ''}
          </span>
          <span>
            {availableSources.length}
            {' '}
            个可用来源
            {data ? ` · 页面更新 ${formatTime(data.updatedAt)}` : ''}
            {auto && page === 1 ? ' · 每 30 秒刷新' : ' · 自动更新列表已暂停'}
          </span>
        </div>
        {error && <Alert className={styles.alert} type="error" showIcon message={error} description={data ? '当前显示上次成功加载的资讯。' : undefined} action={<Button size="small" onClick={() => load()}>重试</Button>} />}
        {newCount > 0 && (
        <Button type="link" className={styles.newMessages} onClick={() => { document.querySelector('section[aria-label="资讯列表"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); setNewCount(0); setNewAfter(null); }}>
          新增 / 更新
          {newCount}
          {' '}
          条，查看最新资讯 ↑
        </Button>
        )}
        <section className={styles.list} aria-label="资讯列表" aria-busy={loading}>
          {loading && !data ? <div className={styles.skeleton}><Skeleton active paragraph={{ rows: 5 }} /></div> : null}
          {!loading && !data?.items.length && !error ? <Empty className={styles.empty} description={emptyText} /> : null}
          {data?.items.map((item) => (
            <article key={item.id} className={`${styles.item} ${item.important ? styles.important : ''} ${item.read || readIds.includes(item.id) ? styles.read : ''} ${newAfter !== null && item.id > newAfter ? styles.newItem : ''}`}>
              <time dateTime={item.publishedAt}>
                {formatTime(item.publishedAt)}
                {item.timeBasis === 'collected' && <small>采集时间</small>}
                {range === 'three-days' ? <small>{dayjs(item.publishedAt).format('MM-DD')}</small> : null}
              </time>
              <div className={styles.itemContent}>
                <div className={styles.meta}>
                  <Tag>{item.sourceName}</Tag>
                  <span>{item.kind === 'flash' ? '快讯' : '报道'}</span>
                  {item.important && <Tag color="red">重点</Tag>}
                  {item.read || readIds.includes(item.id) ? <span>已读</span> : <Tag color="blue">未读</Tag>}
                  {focusMatches(item).length > 0 && (
                  <Tag color="gold">
                    关注：
                    {focusMatches(item).join('、')}
                  </Tag>
                  )}
                  {merge && relatedSources(item).length > 0 && (
                  <Tooltip title={relatedSources(item).join('、')}>
                    <button type="button" className={styles.stockLink} onClick={() => openDetail(item)}>
                      另有
                      {relatedSources(item).length}
                      {' '}
                      个来源
                    </button>
                  </Tooltip>
                  )}
                </div>
                <button type="button" className={styles.title} onClick={() => openDetail(item)}>{item.title}</button>
                {item.translation && (
                  <div className={styles.translationTitle} lang="zh-CN">
                    <Tooltip title="自动翻译，财经术语与专有名词可能有误，以英文原文为准。" trigger={['hover', 'focus', 'click']}>
                      <button type="button" className={styles.translationLabel}>机器翻译</button>
                    </Tooltip>
                    <button type="button" className={styles.title} onClick={() => openDetail(item)}>{item.translation.title}</button>
                  </div>
                )}
                {item.body && item.body !== item.title && <p className={styles.preview}>{item.body}</p>}
                {item.translation?.body && (
                <p className={`${styles.preview} ${styles.translationBody}`} lang="zh-CN">
                  <span className={styles.translationCaption}>机器翻译：</span>
                  {item.translation.body}
                </p>
                )}
                {(item.stocks || []).length > 0 && <Space wrap className={styles.stockTags}>{stockTags(item)}</Space>}
                <div className={styles.actions}>
                  <Button size="small" type="link" onClick={() => openDetail(item)}>查看详情</Button>
                  {item.originalUrl && (
                  <a
                    href={item.originalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => {
                      if (signedIn) api(`/news/${item.id}/read`, 'POST').then(() => setReadIds((old) => Array.from(new Set([...old, item.id])).slice(-2000))).catch((e) => message.error(errorMessage(e)));
                      else setReadIds((old) => Array.from(new Set([...old, item.id])).slice(-2000));
                    }}
                  >
                    阅读原文
                    <ExportOutlined />
                  </a>
                  )}
                </div>
              </div>
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
          </Space>
          <h2>{detail.title}</h2>
          {detail.translation && (
          <div className={styles.translationTitle} lang="zh-CN">
            <span className={styles.translationCaption}>机器翻译</span>
            <h3>{detail.translation.title}</h3>
          </div>
          )}
          {detailError && <Alert type="error" message={detailError} action={<Button size="small" onClick={() => openDetail(detail)}>重试</Button>} />}
          {detailLoading ? <Skeleton active /> : <p className={styles.body}>{detail.body || '请前往原文阅读完整内容。'}</p>}
          {!detailLoading && detail.translation?.body && (
          <p className={`${styles.body} ${styles.translationBody}`} lang="zh-CN">
            <span className={styles.translationCaption}>机器翻译：</span>
            {detail.translation.body}
          </p>
          )}
          {detail.translation && <p className={styles.note}>自动翻译，财经术语与专有名词可能有误，以英文原文为准。</p>}
          {(detail.stocks || []).length > 0 && <Space wrap className={styles.stockTags}>{stockTags(detail)}</Space>}
          {detail.originalUrl && <Button href={detail.originalUrl} target="_blank" rel="noopener noreferrer" icon={<ExportOutlined />}>阅读原文</Button>}
          {(detail.related || []).length > 0 && (
          <section className={styles.related}>
            <h3>相似报道与其他来源</h3>
            <p className={styles.note}>规则匹配，请结合各来源原文判断。</p>
            {detail.related.map((related) => (
              <div key={related.id}>
                <Button
                  type="link"
                  onClick={() => openDetail({
                    ...detail, ...related, stocks: [], related: [],
                  })}
                >
                  {sources.sources.find((s) => s.code === related.source)?.name || related.source}
                  ：
                  {related.title}
                </Button>
                {related.originalUrl && <a href={related.originalUrl} target="_blank" rel="noopener noreferrer">原文 ↗</a>}
              </div>
            ))}
          </section>
          )}
        </div>
        )}
      </Drawer>
      <FocusDrawer open={focusOpen} onClose={() => setFocusOpen(false)} value={preferences} onSaved={setPreferences} />
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
              <Space size={4}>
                <strong>{s.name}</strong>
                {s.description && (
                  <Tooltip title={s.description} trigger={['hover', 'focus', 'click']}>
                    <Button type="text" size="small" aria-label={`${s.name}内容说明`} icon={<InfoCircleOutlined />} />
                  </Tooltip>
                )}
              </Space>
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
            {manager && s.availabilityNote && <p className={styles.note}>{s.availabilityNote}</p>}
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
