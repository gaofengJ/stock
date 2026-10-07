'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Alert, Button, Empty, Input, Result, Segmented, Skeleton, Tabs, Tag,
} from 'antd';
import {
  ApartmentOutlined, DownloadOutlined, MinusOutlined, PlusOutlined, ReloadOutlined, SafetyCertificateOutlined,
} from '@ant-design/icons';
import { useAccount } from '@/auth/Boundary';
import { api } from '@/auth/client';
import { errorMessage } from '@/api/errors';
import NavigationLink, { ExternalLink, InteractionButton } from '@/components/Interaction';
import {
  ancestorsOf, flattenNodes, Guide, GuideMap, GuideNode, searchNodes,
} from './model';
import { xmindArchive } from './xmind';
import './playbook.css';

function NodeDetails({ node }: { node: GuideNode }) {
  return (
    <div className="guide-node-details">
      {node.note && <p>{node.note}</p>}
      {!!node.points?.length && <ul>{node.points.map((point) => <li key={point}>{point}</li>)}</ul>}
      {!!node.links?.length && (
      <div className="guide-references">
        {node.links.map((link) => (link.url.startsWith('/')
          ? <NavigationLink key={link.url} href={link.url}>{link.title}</NavigationLink>
          : <ExternalLink key={link.url} href={link.url}>{link.title}</ExternalLink>))}
      </div>
      )}
    </div>
  );
}

function Outline({ node }: { node: GuideNode }) {
  return (
    <details className="guide-outline-node" open>
      <summary>{node.title}</summary>
      <NodeDetails node={node} />
      {node.children?.map((child) => <Outline key={child.id} node={child} />)}
    </details>
  );
}

function MapViewer({ map, version }: { map: GuideMap; version: string }) {
  const [selected, setSelected] = useState(map.root.id);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set((map.root.children || []).slice(1).map((node) => node.id)));
  const [zoom, setZoom] = useState(0.85);
  const [mode, setMode] = useState('思维导图');
  const [query, setQuery] = useState('');
  const viewport = useRef<HTMLDivElement>(null);
  const nodes = flattenNodes(map.root);
  const active = nodes.find((node) => node.id === selected) || map.root;
  const matches = searchNodes(map.root, query);
  const toggle = (id: string) => setCollapsed((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const focusNode = (id: string) => {
    setSelected(id);
    setCollapsed((current) => {
      const next = new Set(current);
      (ancestorsOf(map.root, id) || []).forEach((ancestor) => next.delete(ancestor));
      return next;
    });
    window.requestAnimationFrame(() => document.getElementById(`guide-${id}`)?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' }));
  };
  const renderBranch = (node: GuideNode, depth = 0): React.ReactNode => {
    const hasChildren = !!node.children?.length;
    const expanded = !collapsed.has(node.id);
    return (
      <li key={node.id} className={`guide-branch guide-depth-${Math.min(depth, 2)}`}>
        <div className={`guide-topic${selected === node.id ? ' is-selected' : ''}`}>
          <button type="button" id={`guide-${node.id}`} className="guide-topic-label" aria-pressed={selected === node.id} aria-controls="guide-inspector" onClick={() => setSelected(node.id)}>{node.title}</button>
          {hasChildren && <InteractionButton intent="expand" expanded={expanded} aria-label={`${expanded ? '收起' : '展开'}${node.title}`} aria-controls={`guide-children-${node.id}`} onClick={() => toggle(node.id)}>{node.children!.length}</InteractionButton>}
        </div>
        {hasChildren && expanded && <ul id={`guide-children-${node.id}`} className="guide-branches">{node.children!.map((child) => renderBranch(child, depth + 1))}</ul>}
      </li>
    );
  };
  const download = () => {
    const bytes = xmindArchive(map);
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/octet-stream' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${map.title}-v${version}.xmind`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <section aria-label={map.title}>
      <div className="guide-map-heading">
        <div>
          <h2>{map.title}</h2>
          <p>{map.subtitle}</p>
        </div>
        <Button icon={<DownloadOutlined />} onClick={download}>下载 XMind</Button>
      </div>
      <div className="guide-executive-summary" aria-label="执行结论"><NodeDetails node={map.root} /></div>
      <div className="guide-toolbar">
        <Segmented aria-label="内容显示方式" options={['思维导图', '体系正文']} value={mode} onChange={(value) => setMode(String(value))} />
        {mode === '思维导图' && (
        <div className="guide-map-tools">
          <Button size="small" aria-label="缩小导图" disabled={zoom <= 0.5} icon={<MinusOutlined />} onClick={() => setZoom((value) => Math.max(0.5, +(value - 0.1).toFixed(2)))} />
          <span className="guide-zoom">
            {Math.round(zoom * 100)}
            %
          </span>
          <Button size="small" aria-label="放大导图" disabled={zoom >= 1.5} icon={<PlusOutlined />} onClick={() => setZoom((value) => Math.min(1.5, +(value + 0.1).toFixed(2)))} />
          <Button size="small" icon={<ReloadOutlined />} onClick={() => { setZoom(0.85); viewport.current?.scrollTo({ left: 0, top: 0 }); }}>复位</Button>
          <Button size="small" onClick={() => setCollapsed(new Set())}>全部展开</Button>
          <Button size="small" onClick={() => setCollapsed(new Set((map.root.children || []).map((node) => node.id)))}>收起分支</Button>
        </div>
        )}
        <Input.Search aria-label="搜索当前体系" placeholder="搜索规则、书名或关键词" allowClear value={query} onChange={(event) => setQuery(event.target.value)} className="guide-search" />
      </div>
      {query.trim() && (
      <div className="guide-search-results" aria-live="polite">
        <span>{`找到 ${matches.length} 个节点`}</span>
        {matches.map((node) => <InteractionButton key={node.id} intent="select" selected={selected === node.id} onClick={() => { setMode('思维导图'); focusNode(node.id); }}>{node.title}</InteractionButton>)}
        {!matches.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有匹配内容，试试其他关键词" />}
      </div>
      )}
      {mode === '体系正文' ? <div className="guide-outline"><Outline node={map.root} /></div> : (
        <div className="guide-workspace">
          {/* Keyboard focus enables native arrow-key scrolling of the map viewport. */}
          {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
          <div className="guide-map-viewport" ref={viewport} tabIndex={0} role="region" aria-label="思维导图画布，可滚动浏览">
            <div className="guide-map-canvas" style={{ zoom }}><ul className="guide-root-list">{renderBranch(map.root)}</ul></div>
          </div>
          <aside id="guide-inspector" className="guide-inspector" aria-label="节点详情">
            <span className="guide-eyebrow">节点详情</span>
            <h3>{active.title}</h3>
            <NodeDetails node={active} />
            {!!active.children?.length && <div className="guide-child-links">{active.children.map((node) => <InteractionButton intent="select" key={node.id} onClick={() => focusNode(node.id)}>{node.title}</InteractionButton>)}</div>}
            {!active.points?.length && <p className="guide-muted">选择分支查看执行规则与学习任务。</p>}
          </aside>
        </div>
      )}
      <p className="guide-footnote">点击节点阅读详情，使用节点旁的箭头展开分支。切换体系正文可连续阅读全部规则；下载文件的节点备注包含完整说明。</p>
    </section>
  );
}

export default function Page() {
  const { user } = useAccount();
  const admin = !!user && !user.guest && user.roles.some((role) => role.code === 'admin');
  const [guide, setGuide] = useState<Guide | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [tab, setTab] = useState('trading');
  useEffect(() => {
    let disposed = false;
    setGuide(null);
    setError('');
    if (admin) {
      api<Guide>('/admin/playbook').then((data) => {
        if (!disposed) setGuide(data);
      }).catch((reason) => { if (!disposed) setError(errorMessage(reason)); });
    }
    return () => { disposed = true; };
  }, [admin, user?.id, retry]);
  if (!admin) return <Result status="403" title="仅管理员可见" />;
  if (error) return <Result status="warning" title="体系内容加载失败" subTitle={error} extra={<Button onClick={() => setRetry((value) => value + 1)}>重试</Button>} />;
  if (!guide) return <Skeleton active paragraph={{ rows: 8 }} />;
  const map = guide.maps.find((item) => item.id === tab) || guide.maps[0];
  return (
    <div className="playbook-page">
      <div className="guide-header">
        <div>
          <span className="guide-eyebrow">
            <ApartmentOutlined />
            {' '}
            TRADING PLAYBOOK
          </span>
          <h1>交易与学习体系</h1>
          <p>交易、复盘、学习与经验，按同一套决策规则执行。</p>
        </div>
        <Tag icon={<SafetyCertificateOutlined />}>仅管理员</Tag>
      </div>
      <div className="guide-meta">
        <Tag color="gold">{guide.status}</Tag>
        <span>{`版本 v${guide.version}，更新于 ${guide.updatedAt}。`}</span>
      </div>
      <Alert type="info" showIcon message={guide.introduction} />
      <Tabs activeKey={map.id} onChange={setTab} items={guide.maps.map((item) => ({ key: item.id, label: item.title }))} />
      <MapViewer key={map.id} map={map} version={guide.version} />
    </div>
  );
}
