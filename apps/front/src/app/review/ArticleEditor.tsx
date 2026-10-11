'use client';

/* eslint-disable react/no-danger, react/jsx-closing-tag-location -- HTML is produced by the escaping renderer; local raster images use data URLs. */
/* eslint jsx-a11y/label-has-associated-control: ["error", { "assert": "htmlFor" }] */
import { useRef, useState } from 'react';
import {
  Alert, Button, Collapse, Empty, Input, Select, Space,
} from 'antd';
import { copyText } from '@/utils/clipboard';
import {
  Article, ArticleImage, emptyArticle, validateArticle,
} from './article-contract';
import { NotebookContent, noteHtml, publicText } from './notebook-model';
import { readImage, evidenceImage } from './article-media';
import { readResult, reviewPacket } from './article-handoff';
import { researchDraft } from './research';

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function ArticleEditor({
  date, revision, content, disabled, dirty, onChange, onStatus: reportStatus,
}: {
  date: string; revision: number; content: NotebookContent; disabled: boolean; dirty: boolean;
  onChange: (article: Article) => void; onStatus: (text: string) => void;
}) {
  const legacy = Object.values(content.public).some((v) => v.trim());
  const article = content.article || { ...emptyArticle(), body: legacy ? publicText(date, content, 'wechat') : '' };
  const current = useRef(article); current.current = article;
  const context = useRef({
    date, revision, dirty, disabled,
  }); context.current = {
    date, revision, dirty, disabled,
  };
  const [notice, setNotice] = useState('');
  const onStatus = (message: string) => { setNotice(message); reportStatus(message); };
  const [mode, setMode] = useState('preview'); const [pending, setPending] = useState(false);
  const [error, setError] = useState(''); const [result, setResult] = useState('');
  const upload = useRef<HTMLInputElement>(null); const importFile = useRef<HTMLInputElement>(null);
  const text = publicText(date, { ...content, article }, 'wechat');
  const html = noteHtml(text, article.images);
  const headings = Array.from(new Set(Array.from(article.body.matchAll(/^## (.+)$/gm), (m) => m[1].trim())));
  const update = (next: Article) => { try { onChange(validateArticle(next)); setError(''); } catch (e) { setError((e as Error).message); } };
  const add = (images: ArticleImage[]) => update({ ...current.current, images: [...current.current.images, ...images] });
  const addFiles = async (files: File[]) => {
    if (disabled || pending) return;
    if (files.length + current.current.images.length > 20) { setError('每篇文章最多 20 张图片'); return; }
    setPending(true); setError('');
    try { const images = await Promise.all(files.map(readImage)); add(images); setMode('preview'); } catch (e) { setError((e as Error).message); } finally { setPending(false); }
  };
  const replaceImage = (id: string, value: Partial<ArticleImage>) => update({ ...article, images: article.images.map((i) => (i.id === id ? { ...i, ...value } : i)) });
  const move = (index: number, offset: number) => { const images = [...article.images]; [images[index], images[index + offset]] = [images[index + offset], images[index]]; update({ ...article, images }); };
  const draft = () => {
    if (!content.research || (article.body.trim() && !window.confirm('将使用当前公开资料重新生成正文。已保存版本和配图保留，未保存正文将被替换。继续？'))) return;
    update({ ...article, body: researchDraft(content.research, content.public, window.location.origin) }); setMode('preview');
  };
  const copy = async () => {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([article.body], { type: 'text/plain' }) })]);
      onStatus(article.images.length ? '图文已复制。粘贴后核对图片；目标编辑器若过滤图片，可逐张复制配图或使用完整图文文件。' : '文章已复制，可直接粘贴。');
    } catch { onStatus(await copyText(article.body) ? '已复制纯文字；浏览器未允许图文复制，请下载完整图文文件。' : '复制失败，请下载完整图文文件。'); }
  };
  const importResult = (raw: string) => {
    try {
      if (context.current.dirty || context.current.disabled || context.current.date !== date || context.current.revision !== revision) throw new Error('当前版本已变动，请先保存后重新导入');
      update(readResult(raw, date, revision)); setResult(''); onStatus('成稿与图片已回填，请检查并保存新版本。');
    } catch (e) { setError((e as Error).message); }
  };
  return (
    <div className="notebook-panel">
      <p>公开文章独立于私人笔记。先带入当日资料，再补充观点与配图，随时预览或复制。</p>
      {error && <Alert type="error" message={error} />}
      {notice && <Alert type="info" message={notice} />}
      <Space wrap size={12}>
        <Button disabled={disabled || !content.research?.sections.some((s) => s.state === 'ready')} onClick={draft}>用当日资料生成初稿</Button>
        <Button disabled={disabled} onClick={() => setMode(mode === 'preview' ? 'edit' : 'preview')}>{mode === 'preview' ? '编辑正文' : '预览图文'}</Button>
        <Button type="primary" disabled={!article.body.trim()} onClick={copy}>复制完整文章</Button>
        <Button disabled={!article.body.trim()} onClick={() => download(`${date}-复盘图文.html`, `<!doctype html><meta charset="utf-8"><title>${date} 复盘</title>${html}`, 'text/html;charset=utf-8')}>下载完整图文</Button>
      </Space>
      {mode === 'edit' && (
        <div className="notebook-field">
          <label htmlFor="article-body">文章正文（使用 ## 标记章节，配图在下方管理）</label>
          <Input.TextArea id="article-body" disabled={disabled} value={article.body} maxLength={40000} autoSize={{ minRows: 16 }} onChange={(e) => update({ ...article, body: e.target.value })} />
        </div>
      )}
      {mode === 'preview' && (article.body.trim() ? <div className="notebook-article-preview" dangerouslySetInnerHTML={{ __html: html }} /> : <Empty description="先在复盘流程中读取当日资料，生成初稿；也可以直接编辑正文或导入 Skill 成稿。" />)}
      <section className="notebook-media" aria-label="文章配图">
        <h2>文章配图</h2>
        <p>支持最多 20 张图片。可上传图表、粘贴截图，或从已读取的市场资料生成配图。正文、图片和来源一起保存。</p>
        <Space wrap size={12}>
          <Button disabled={disabled} loading={pending} onClick={() => upload.current?.click()}>上传配图</Button>
          <Select aria-label="生成市场图表" placeholder="从当日资料生成图表" value={null} disabled={disabled} options={(content.research?.sections || []).filter((s) => s.points.length).map((s) => ({ value: s.key, label: s.title }))} onChange={(key) => { const s = content.research?.sections.find((v) => v.key === key); if (s) { try { add([evidenceImage(date, { ...s, source: new URL(s.source, window.location.origin).href })]); } catch (e) { setError((e as Error).message); } } }} />
        </Space>
        <input hidden ref={upload} type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={(e) => { addFiles(Array.from(e.target.files || [])); e.target.value = ''; }} />
        <Input.TextArea aria-label="粘贴配图" disabled={disabled || pending} placeholder="在这里按 Ctrl+V 粘贴截图。请确认截图适合放入公开文章。" rows={2} value="" onChange={() => {}} onPaste={(e) => { const files = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith('image/')); if (files.length) { e.preventDefault(); addFiles(files); } }} />
        <div className="notebook-media-grid">
          {article.images.map((image, index) => (
            <div className="notebook-media-card" key={image.id}>
              <img src={image.data} alt={image.caption || `配图 ${index + 1}`} />
              <Input aria-label={`配图 ${index + 1} 图注`} disabled={disabled} placeholder="图注" value={image.caption} maxLength={300} onChange={(e) => replaceImage(image.id, { caption: e.target.value })} />
              <Input aria-label={`配图 ${index + 1} 来源`} disabled={disabled} placeholder="来源、日期或原文链接" value={image.source} maxLength={1500} onChange={(e) => replaceImage(image.id, { source: e.target.value })} />
              <Select aria-label={`配图 ${index + 1} 位置`} disabled={disabled} value={image.after} options={[{ value: '', label: '文章开头' }, ...headings.map((h) => ({ value: h, label: `${h}之后` }))]} onChange={(after) => replaceImage(image.id, { after })} />
              <Space wrap size={8}>
                <Button disabled={disabled || index === 0} onClick={() => move(index, -1)}>上移</Button>
                <Button disabled={disabled || index === article.images.length - 1} onClick={() => move(index, 1)}>下移</Button>
                <Button disabled={disabled} onClick={() => update({ ...article, images: article.images.filter((i) => i.id !== image.id) })}>移除</Button>
                <Button onClick={async () => {
                  try { const file = await fetch(image.data).then((r) => r.blob()); const bitmap = await createImageBitmap(file); const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height; canvas.getContext('2d')!.drawImage(bitmap, 0, 0); bitmap.close(); const blob = await new Promise<Blob>((resolve, reject) => { canvas.toBlob((b) => { if (b) resolve(b); else reject(new Error('图片转换失败')); }, 'image/png'); }); await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); onStatus('图片已复制，可在目标文档对应位置粘贴。'); } catch { onStatus('图片复制失败，请下载图片。'); }
                }}
                >
                  复制图片
                </Button>
                <Button onClick={() => { const a = document.createElement('a'); a.href = image.data; a.download = `${date}-${index + 1}.${image.data.startsWith('data:image/png') ? 'png' : 'jpg'}`; a.click(); }}>下载图片</Button>
              </Space>
            </div>
          ))}
        </div>
      </section>
      <Collapse items={[{
        key: 'skill',
        label: '交给复盘 Skill 整理并写入飞书',
        children: <div className="notebook-detail-fields">
          <p>先保存版本。资料包包含公开正文、当日来源和完整图片；不包含私人笔记。将任务交给 Codex 后，Skill 可从本页下载资料包，完成飞书图文并回填结果。</p>
          <Space wrap size={12}>
            <Button
              disabled={disabled || dirty || !revision}
              onClick={async () => {
                const packet = reviewPacket(date, revision, { ...content, article });
                const prompt = `使用 $stock-review-feishu 整理 ${date} 复盘图文并保存到已配置的飞书目录。网站地址：${window.location.origin}/review/?date=${date}，已保存版本 ${revision}。打开“图文成稿”中的“交给复盘 Skill 整理并写入飞书”，下载“图文资料包”，其中含 ${article.images.length} 张完整图片，按图注及位置写入。不要读取私人笔记。完成后按 stock-review/v1 格式生成结果包，通过本页“导入 Skill 成稿”回填正文、图片和真实飞书链接，保存新版本。\n\n公开正文：\n${packet.article.body}\n\n当日资料：\n${JSON.stringify(packet.research)}`;
                onStatus(await copyText(prompt) ? '任务和当日公开资料已复制，请在 Codex 中发送。完整图片由 Skill 从本页资料包读取。' : '复制失败，请下载图文资料包。');
              }}
            >
              复制本次图文任务
            </Button>
            <Button disabled={disabled || dirty || !revision} onClick={() => download(`${date}-review-v${revision}.json`, JSON.stringify(reviewPacket(date, revision, { ...content, article }), null, 2), 'application/json')}>下载图文资料包</Button>
            <Button disabled={disabled || dirty || !revision} onClick={() => importFile.current?.click()}>导入 Skill 成稿</Button>
          </Space>
          {dirty && <p>请先保存当前修改，再交接或导入结果，以免覆盖不同版本。</p>}
          <input hidden ref={importFile} type="file" accept="application/json,.json" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { if (f.size > 7000000) setError('结果文件过大'); else importResult(await f.text()); } }} />
          <Input.TextArea aria-label="Skill 返回结果" placeholder="也可粘贴 Skill 返回的 JSON 结果" value={result} maxLength={6500000} rows={3} onChange={(e) => setResult(e.target.value)} />
          <Button disabled={disabled || dirty || !revision || !result} onClick={() => importResult(result)}>应用返回结果</Button>
          {article.feishuUrl && <a href={article.feishuUrl} target="_blank" rel="noopener noreferrer">打开已关联的飞书图文</a>}
        </div>,
      }]}
      />
    </div>
  );
}
