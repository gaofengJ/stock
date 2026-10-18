'use client';

/* eslint-disable react/no-danger, react/jsx-closing-tag-location -- HTML is produced by the escaping renderer; local raster images use data URLs. */
/* eslint jsx-a11y/label-has-associated-control: ["error", { "assert": "htmlFor" }] */
import { useRef, useState } from 'react';
import {
  Alert, Button, Checkbox, Collapse, Input, Modal, Space,
} from 'antd';
import { copyText } from '@/utils/clipboard';
import {
  Article, ArticleImage, emptyArticle, illustratedText, validateArticle,
} from './article-contract';
import {
  documentTemplate, NotebookContent, SavedNotebook, noteHtml, publicText,
} from './notebook-model';
import { readImage } from './article-media';
import { materialSources, readResult, reviewPacket } from './article-handoff';
import { missingPlatformImages } from './platform-images';
import { Materials, emptyMaterials, materialUrl } from './materials-contract';
import { notebookPayload } from './notebook-limits';

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function ArticleEditor({
  date, revision, content, disabled, dirty, saving, onSave, generation = 0, previewDisabled = false, onChange, onMaterials, onStatus: reportStatus,
}: {
  date: string; revision: number; generation?: number; content: NotebookContent; disabled: boolean; dirty: boolean;
  saving: boolean; onSave: () => Promise<SavedNotebook | null>;
  previewDisabled?: boolean;
  onMaterials: (materials: Materials) => void; onChange: (article: Article) => void; onStatus: (text: string) => void;
}) {
  const legacy = Object.entries(content.public).some(([key, value]) => key !== 'title' && value.trim());
  const article = content.article || { ...emptyArticle(), body: legacy ? publicText(date, content, 'wechat') : '' };
  const missingImages = missingPlatformImages(article.images);
  const savedStatus = revision ? `记录已保存，版本 ${revision}。` : '当天尚未保存。';
  const current = useRef(article); current.current = article;
  const context = useRef({
    date, revision, dirty, disabled,
  }); context.current = {
    date, revision, dirty, disabled,
  };
  const [preview, setPreview] = useState(false);
  const [notice, setNotice] = useState('');
  const [handoffBusy, setHandoffBusy] = useState(false);
  const handoffLock = useRef(false);
  const [manualTask, setManualTask] = useState('');
  const [handoffNotice, setHandoffNotice] = useState('');
  const onStatus = (message: string) => { setNotice(message); reportStatus(message); };
  const [pending, setPending] = useState(false);
  const materials = content.materials || emptyMaterials();
  const [linkUrl, setLinkUrl] = useState(''); const [linkTitle, setLinkTitle] = useState(''); const [linkNote, setLinkNote] = useState('');
  const [error, setError] = useState('');
  const upload = useRef<HTMLInputElement>(null); const importFile = useRef<HTMLInputElement>(null);
  const text = article.body.trim() ? publicText(date, { ...content, article }, 'wechat') : illustratedText(documentTemplate(date, content), article.images);
  const html = noteHtml(text, article.images);
  const update = (next: Article) => { try { onChange(validateArticle(next)); setError(''); } catch (e) { setError((e as Error).message); } };
  const add = (images: ArticleImage[]) => update({ ...current.current, images: [...current.current.images, ...images] });
  const addFiles = async (files: File[]) => {
    if (disabled || pending) return;
    if (files.length + current.current.images.length > 20) { setError('每篇文章最多 20 张图片'); return; }
    setPending(true); setError('');
    try { const images = await Promise.all(files.map(readImage)); add(images); } catch (e) { setError((e as Error).message); } finally { setPending(false); }
  };
  const replaceImage = (id: string, value: Partial<ArticleImage>) => update({ ...article, images: article.images.map((i) => (i.id === id ? { ...i, ...value } : i)) });
  const move = (index: number, offset: number) => { const images = [...article.images]; [images[index], images[index + offset]] = [images[index + offset], images[index]]; update({ ...article, images }); };
  const copy = async () => {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([article.body], { type: 'text/plain' }) })]);
      onStatus(article.images.length ? '图文已复制。粘贴后核对图片；目标编辑器若过滤图片，可使用完整图文文件。' : '文章已复制，可直接粘贴。');
    } catch { onStatus(await copyText(article.body) ? '已复制纯文字；浏览器未允许图文复制，请下载完整图文文件。' : '复制失败，请下载完整图文文件。'); }
  };
  const importResult = (raw: string) => {
    try {
      if (context.current.dirty || context.current.disabled || context.current.date !== date || context.current.revision !== revision) throw new Error('当前版本已变动，请先保存后重新导入');
      const imported = readResult(raw, date, revision, content, generation);
      notebookPayload(date, revision, generation, { ...content, article: imported });
      onChange(imported); setError(''); setHandoffNotice(''); onStatus('成稿与图片已导入，预览确认后点击“保存复盘”。');
    } catch (e) { setError((e as Error).message); }
  };
  return (
    <div className="notebook-panel">
      <div className="notebook-panel-intro">
        <p>{`${article.body.trim() ? '已有成稿' : '当前是记录草稿，还没有 AI 分析'}，包含 ${article.images.length} 张图片。`}</p>
        <Space wrap>
          <Button disabled={previewDisabled} onClick={() => setPreview(true)}>{article.body.trim() ? '预览成稿' : '预览记录草稿'}</Button>
          {article.body.trim() && <Button onClick={copy}>复制完整文章</Button>}
          <Button disabled={!article.body.trim() && !article.images.length} onClick={() => download(`${date}-复盘图文.html`, `<!doctype html><meta charset="utf-8"><title>${date} 复盘</title>${html}`, 'text/html;charset=utf-8')}>导出图文</Button>
        </Space>
      </div>
      {error && <Alert type="error" message={error} />}
      {notice && <Alert type="info" message={notice} />}
      <Collapse items={[{
        key: 'materials',
        label: `补充图片与来源（可选，已有 ${article.images.length} 张图片）`,
        children: <div className="notebook-panel">
          <section className="notebook-material-links">
            <h2>取图来源</h2>
            <p className="review-caption">可以直接交给 Skill 按这些链接取图；也可以补充上传图片。</p>
            <Space wrap size={12}>{materialSources(date, content).map((item) => <a key={item.url} href={item.url} target="_blank" rel="noreferrer">{item.title}</a>)}</Space>
            {materials.links.map((item) => (
              <div className="notebook-source-row" key={item.id}>
                <div>
                  <a href={item.url} target="_blank" rel="noreferrer">{item.title || item.url}</a>
                  {item.note && <p>{item.note}</p>}
                </div>
                <Button disabled={disabled} aria-label={`移除素材 ${item.title || item.url}`} onClick={() => onMaterials({ ...materials, links: materials.links.filter((s) => s.id !== item.id) })}>移除</Button>
              </div>
            ))}
            <Collapse
              ghost
              items={[{
                key: 'link',
                label: '补充素材链接',
                children: <div className="notebook-detail-fields">
                  <Input aria-label="素材标题" placeholder="标题，例如：某只股票的 K 线" maxLength={300} value={linkTitle} onChange={(e) => setLinkTitle(e.target.value)} />
                  <Input aria-label="素材链接" placeholder="完整的网页或图片链接" maxLength={1500} value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
                  <Input aria-label="取图说明" placeholder="希望截取哪个图、观察什么（可选）" maxLength={2000} value={linkNote} onChange={(e) => setLinkNote(e.target.value)} />
                  <Button
                    disabled={disabled || !linkUrl.trim() || materials.links.length >= 40}
                    onClick={() => {
                      try {
                        const url = materialUrl(linkUrl.trim()); onMaterials({
                          ...materials,
                          links: [...materials.links, {
                            id: crypto.randomUUID(), title: linkTitle.trim(), url, note: linkNote,
                          }],
                        }); setLinkUrl(''); setLinkTitle(''); setLinkNote(''); setError('');
                      } catch (e) { setError((e as Error).message); }
                    }}
                  >
                    添加链接
                  </Button>
                </div>,
              }]}
            />
            {!!materials.calendar.length && (
            <Collapse items={[{
              key: 'events',
              label: `已选日历事件（${materials.calendar.length}）`,
              children: materials.calendar.map((item) => (
                <div className="notebook-source-row" key={item.id}>
                  <div>
                    <strong>{`${item.date} ${item.title}`}</strong>
                    <p>{item.detail}</p>
                    <a href={item.source} target="_blank" rel="noreferrer">来源</a>
                  </div>
                  <Button aria-label={`移除日历 ${item.title}`} disabled={disabled} onClick={() => onMaterials({ ...materials, calendar: materials.calendar.filter((s) => s.id !== item.id) })}>移除</Button>
                </div>
              )),
            }]}
            />
            )}
          </section>
          <section className="notebook-media" aria-label="文章配图">
            <h2>图片素材</h2>
            <p>平台图片已自动加入；需要时补充截图。最多 20 张。</p>
            <Space wrap size={12}>
              <Button disabled={disabled} loading={pending} onClick={() => upload.current?.click()}>上传配图</Button>
            </Space>
            <input hidden ref={upload} type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={(e) => { addFiles(Array.from(e.target.files || [])); e.target.value = ''; }} />
            <Input.TextArea aria-label="粘贴配图" disabled={disabled || pending} placeholder="在这里按 Ctrl+V 粘贴截图。图片将交给 Skill 生成飞书图文。" rows={2} value="" onChange={() => {}} onPaste={(e) => { const files = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith('image/')); if (files.length) { e.preventDefault(); addFiles(files); } }} />
            <div className="notebook-media-grid">
              {article.images.map((image, index) => (image.id.startsWith('platform-') ? null : (
                <div className="notebook-media-card" key={image.id}>
                  <img src={image.data} alt={image.caption || `配图 ${index + 1}`} />
                  <Input aria-label={`配图 ${index + 1} 图注`} disabled={disabled} placeholder="图注" value={image.caption} maxLength={300} onChange={(e) => replaceImage(image.id, { caption: e.target.value })} />
                  <Input aria-label={`配图 ${index + 1} 来源`} disabled={disabled} placeholder="来源、日期或原文链接" value={image.source} maxLength={1500} onChange={(e) => replaceImage(image.id, { source: e.target.value })} />
                  <Space wrap size={8}>
                    {article.images.length > 1 && <Button disabled={disabled || index === 0} onClick={() => move(index, -1)}>上移</Button>}
                    {article.images.length > 1 && <Button disabled={disabled || index === article.images.length - 1} onClick={() => move(index, 1)}>下移</Button>}
                    <Button disabled={disabled} onClick={() => update({ ...article, images: article.images.filter((i) => i.id !== image.id) })}>移除</Button>
                  </Space>
                </div>
              )))}
            </div>
          </section>
        </div>,
      }]}
      />
      <section className="notebook-handoff" aria-label="保存与 AI 整理">
        <div className="notebook-save-row">
          <Button type="primary" disabled={disabled || !dirty || pending || handoffBusy} loading={saving} onClick={() => onSave()}>保存复盘</Button>
          <span className="review-caption">{dirty ? '有未保存的修改。保存后也可以继续编辑。' : savedStatus}</span>
        </div>
        <h2>交给 AI 整理（可选）</h2>
        <p>只做记录，保存即可。需要飞书图文时，在 Codex 中运行 stock-review-feishu；本站不会自动执行 AI。</p>
        <ol className="notebook-handoff-steps">
          <li>点击“准备 Codex 任务”，自动保存、下载图文资料包并复制任务。</li>
          <li>在 Codex 粘贴任务，并附上刚下载的 JSON 资料包，再发送执行。</li>
          <li>完成后在这里导入结果包，预览确认并保存。用户原文会保留，AI 分析另写。</li>
        </ol>
        {!!missingImages.length && <Alert type="info" message="平台配图尚未齐全。可在页面顶部“准备图文资料”，或交给 Codex 按链接补取。预览只显示当前已收录内容。" />}
        <Checkbox disabled={disabled} checked={materials.includeExecution} onChange={(e) => onMaterials({ ...materials, includeExecution: e.target.checked })}>交接持仓与操作记录，仅用于私人飞书复盘</Checkbox>
        <Space wrap size={12}>
          <Button
            loading={handoffBusy}
            disabled={disabled || pending}
            onClick={async () => {
              if (handoffLock.current) return;
              handoffLock.current = true; setHandoffBusy(true); setNotice(''); setHandoffNotice('正在生成任务');
              try {
                const saved = dirty || !revision ? await onSave() : {
                  date, revision, generation, content: { ...content, article },
                };
                if (!saved) { setHandoffNotice('尚未完成保存，请检查页面提示后重试。新的修改会继续保留。'); return; }
                const packet = reviewPacket(saved.date, saved.revision, saved.content, window.location.origin, saved.generation);
                const prompt = `使用 $stock-review-feishu 生成 ${saved.date} 的飞书图文复盘。网站：${window.location.origin}/review/?date=${saved.date}，保存版本 ${saved.revision}。使用随任务附上的图文资料包（stock-review/v2）；如未附上，请先索取资料包。保留资料包 userNotes 的非空原文，并另外写 AI 独立分析，空白不能当作空仓或无交易。标题默认 ${saved.content.public.title || `${saved.date}复盘`}；优先使用已有平台图片；缺少市场概览、情绪指标、连板分析或全部涨停长图时，按资料链接补取四张暗色长图，不重复取已有图片。开头声明本文由AI生成，仅供参考。市场概览、情绪指标、连板分析各写简要解读，策略选股只列股票名和策略标签；闲聊默认空白；二级标题之间留空行；不单列明日计划。正常目标10分钟，20分钟硬停止并保留可续接进度。已有 ${saved.content.article?.images.length || 0} 张图片，仅在缺少必需图片时按 materials.links 补取，最终必须嵌入真实图片。完成后用同日期和版本的结果包通过“导入 AI 成稿”导入，再保存记录。不得覆盖用户原文。执行记录授权：${saved.content.materials?.includeExecution ? '仅限私人飞书文档' : '未包含，不读取'}。网站没有自动运行 Skill，请在 Codex 执行此任务。\n\n用户记录：\n${JSON.stringify(packet.userNotes)}\n\n图片来源：\n${JSON.stringify(packet.materials.links)}`;
                download(`${saved.date}-review-v${saved.revision}.json`, JSON.stringify(packet, null, 2), 'application/json');
                const copied = await copyText(prompt);
                const message = copied ? '任务已复制，资料包已发起下载。请在 Codex 粘贴任务并附上资料包后发送。' : '资料包已发起下载，任务未能自动复制。请在弹窗中复制，并将资料包一同交给 Codex。';
                setHandoffNotice(message); reportStatus(message);
                if (!copied) setManualTask(prompt);
              } catch (e) { setHandoffNotice(`任务生成失败：${(e as Error).message}`); } finally { handoffLock.current = false; setHandoffBusy(false); }
            }}
          >
            准备 Codex 任务
          </Button>
          <Button disabled={disabled || dirty || !revision || pending || handoffBusy} onClick={() => importFile.current?.click()}>导入 AI 成稿</Button>
          {article.feishuUrl && <a href={article.feishuUrl} target="_blank" rel="noopener noreferrer">打开飞书文档</a>}
        </Space>
        {handoffNotice && <Alert type="info" message={<span role="status">{handoffNotice}</span>} />}
        <p className="review-caption">{dirty || !revision ? '准备任务会先保存当前记录与图片；导入成稿前也需先保存修改。' : `当前交接保存版本 ${revision}，原文与图片一并保留。`}</p>
        <input hidden ref={importFile} type="file" accept="application/json,.json" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { if (f.size > 7000000) setError('结果文件过大'); else importResult(await f.text()); } }} />
      </section>
      <Modal
        open={!!manualTask}
        title="复制 Skill 任务"
        onCancel={() => setManualTask('')}
        footer={[
          <Button key="download" onClick={() => download(`${date}-Skill任务.txt`, manualTask, 'text/plain;charset=utf-8')}>下载任务文本</Button>,
          <Button
            key="copy"
            type="primary"
            onClick={async () => {
              const copied = await copyText(manualTask);
              setHandoffNotice(copied ? '任务已复制，资料包已发起下载。请在 Codex 粘贴任务并附上资料包后发送。' : '请选中任务文本，使用 Ctrl+C 或 Command+C 复制。');
              if (copied) setManualTask('');
            }}
          >
            重新复制
          </Button>,
        ]}
      >
        <p>选中下方完整任务文本，使用 Ctrl+C 或 Command+C 复制到 Codex。</p>
        <Input.TextArea aria-label="Skill 任务文本" readOnly value={manualTask} rows={12} onFocus={(e) => e.target.select()} />
      </Modal>
      <Modal className={`notebook-preview-modal${preview ? ' notebook-preview-open' : ''}`} open={preview} destroyOnClose title={content.public.title || `${date}复盘`} width={1000} onCancel={() => setPreview(false)} footer={<Button onClick={() => setPreview(false)}>关闭</Button>}>
        {!article.body.trim() && <Alert type="info" message="这是记录草稿，尚未包含 AI 分析。生成飞书图文请使用“准备 Codex 任务”。" />}
        <div className="notebook-article-preview" dangerouslySetInnerHTML={{ __html: html }} />
      </Modal>
    </div>
  );
}
