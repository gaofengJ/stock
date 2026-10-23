'use client';

/* eslint-disable react/no-danger, react/jsx-closing-tag-location -- HTML is produced by the escaping renderer; local raster images use data URLs. */
/* eslint jsx-a11y/label-has-associated-control: ["error", { "assert": "htmlFor" }] */
import { useRef, useState } from 'react';
import {
  Alert, Button, Checkbox, Collapse, Input, Modal, Select, Space,
} from 'antd';
import BusinessAction from '@/components/PersonalAi/BusinessAction';
import { Task } from '@/components/PersonalAi/client';
import { copyText } from '@/utils/clipboard';
import {
  Article, ArticleImage, emptyArticle, illustratedText, validateArticle,
} from './article-contract';
import {
  ArticleTarget, articlePlainText, documentTemplate, NotebookContent, SavedNotebook, noteHtml, publicText, reviewDocument,
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
  date, revision, content, disabled, dirty, saving, onSave, generation = 0, previewDisabled = false, onChange, onMaterials, onStatus: reportStatus, prepareImages,
}: {
  prepareImages: () => Promise<void>;
  date: string; revision: number; generation?: number; content: NotebookContent; disabled: boolean; dirty: boolean;
  saving: boolean; onSave: () => Promise<SavedNotebook | null>;
  previewDisabled?: boolean;
  onMaterials: (materials: Materials) => void; onChange: (article: Article) => void; onStatus: (text: string) => void;
}) {
  const legacy = Object.entries(content.public).some(([key, value]) => key !== 'title' && value.trim());
  const article = content.article || { ...emptyArticle(), body: legacy ? publicText(date, content, 'wechat') : '' };
  const missingImages = missingPlatformImages(article.images);
  const savedStatus = revision ? `记录已保存，版本 ${revision}。` : '当天尚未保存。';
  const currentContent = useRef(content); currentContent.current = content;
  const current = useRef(article); current.current = article;
  const context = useRef({
    date, revision, dirty, disabled,
  }); context.current = {
    date, revision, dirty, disabled,
  };
  const [preview, setPreview] = useState(false);
  const [target, setTarget] = useState<ArticleTarget>('feishu');
  const [copyNotice, setCopyNotice] = useState('');
  const [copying, setCopying] = useState(false);
  const targetNames = { feishu: '飞书云文档', wechat: '公众号', xueqiu: '雪球长文' };
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
  const upload = useRef<HTMLInputElement>(null);
  const text = article.body.trim() ? publicText(date, { ...content, article }, 'wechat') : illustratedText(documentTemplate(date, content), article.images);
  const html = noteHtml(text, article.images, target);
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
    if (copying) return;
    setCopying(true); setCopyNotice('');
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([articlePlainText(text)], { type: 'text/plain' }) })]),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Clipboard timed out')), 3000); }),
      ]);
      setCopyNotice(`已按${targetNames[target]}格式复制。粘贴后核对图片；缺失时可展开下方“原图”下载后插入。`);
    } catch { setCopyNotice(await copyText(articlePlainText(text)) ? '已复制纯文字，未包含图片。可在下方下载原图，按原位置插入。' : '复制失败，请选中预览正文手动复制。'); } finally { clearTimeout(timer); setCopying(false); }
  };
  const importResult = (raw: string) => {
    try {
      if (context.current.dirty || context.current.disabled || context.current.date !== date || context.current.revision !== revision) throw new Error('当前版本已变动，请先保存后重新导入');
      const imported = readResult(raw, date, revision, content, generation);
      notebookPayload(date, revision, generation, { ...content, article: imported });
      onChange(imported); setError(''); setHandoffNotice(''); onStatus('成稿与图片已导入，预览确认后点击“保存”。');
    } catch (e) { setError((e as Error).message); }
  };
  return (
    <div className="notebook-panel">
      <div className="notebook-panel-intro">
        <p>{`${article.body.trim() ? '图文已生成' : '尚未生成 AI 正文'}，已收录 ${article.images.length} 张图片。`}</p>
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
        {!!missingImages.length && <p className="review-caption">生成时会补齐缺少的配图；已收录的图片直接复用。</p>}
        <Checkbox disabled={disabled} checked={materials.includeExecution} onChange={(e) => onMaterials({ ...materials, includeExecution: e.target.checked })}>文档包含持仓与操作记录</Checkbox>
        <Space wrap size={12}>
          <BusinessAction
            compact
            skill="market-review"
            date={date}
            disabled={disabled || pending || handoffBusy}
            beforeStart={prepareImages}
            onComplete={(task: Task) => {
              if (task.date !== context.current.date) throw Error('日期已切换，结果保留在分析记录中。');
              const latest = currentContent.current;
              const body = reviewDocument(date, latest, task.answer || '');
              update({ ...(latest.article || emptyArticle()), body });
              onStatus('复盘文档已生成，原文与配图已保留。预览后可复制到飞书，确认后保存。');
            }}
          />

          <Button
            aria-label="准备 Codex 任务"
            aria-busy={handoffBusy}
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
                const prompt = `使用 $stock-review-feishu 生成 ${saved.date} 的飞书图文复盘。网站：${window.location.origin}/review/?date=${saved.date}，保存版本 ${saved.revision}。使用随任务附上的图文资料包（stock-review/v2）；如未附上，请先索取资料包。保留资料包 userNotes 的非空原文，并另外写 AI 独立分析，空白不能当作空仓或无交易。标题默认 ${saved.content.public.title || `${saved.date}复盘`}；优先使用已有平台图片；缺少市场概览、情绪指标、连板分析、20日板块轮动或全部涨停长图时，按资料链接补取五张暗色长图，不重复取已有图片。开头声明本文由AI生成，仅供参考。市场数据下依次设置市场概览、情绪指标、连板分析、20日板块轮动四个子节，各写简要解读；不设置独立的板块轮动大章。策略选股只列股票名和策略标签；闲聊默认空白；二级标题之间留空行；不单列明日计划。正常目标10分钟，20分钟硬停止并保留可续接进度。已有 ${saved.content.article?.images.length || 0} 张图片，仅在缺少必需图片时按 materials.links 补取，最终必须嵌入真实图片。完成后用同日期和版本的结果包在“准备 Codex 任务”弹窗中选择结果包回填，再保存记录。不得覆盖用户原文。执行记录授权：${saved.content.materials?.includeExecution ? '仅限私人飞书文档' : '未包含，不读取'}。本次任务由 Codex 执行并生成飞书云文档。\n\n用户记录：\n${JSON.stringify(packet.userNotes)}\n\n图片来源：\n${JSON.stringify(packet.materials.links)}`;
                download(`${saved.date}-review-v${saved.revision}.json`, JSON.stringify(packet, null, 2), 'application/json');
                const copied = await copyText(prompt);
                const message = copied ? '任务已复制，资料包已发起下载。请在 Codex 粘贴任务并附上资料包后发送。' : '资料包已发起下载，任务未能自动复制。请在弹窗中复制，并将资料包一同交给 Codex。';
                setHandoffNotice(message); reportStatus(message);
                setManualTask(prompt);
              } catch (e) { setHandoffNotice(`任务生成失败：${(e as Error).message}`); } finally { handoffLock.current = false; setHandoffBusy(false); }
            }}
          >
            准备 Codex 任务
          </Button>
          <Button disabled={previewDisabled || handoffBusy} onClick={() => { setCopyNotice(''); setPreview(true); }}>预览</Button>
          <Button aria-label="保存" aria-busy={saving} disabled={disabled || !dirty || pending || handoffBusy} loading={saving} onClick={() => onSave()}>保存</Button>
          {article.feishuUrl && <a href={article.feishuUrl} target="_blank" rel="noopener noreferrer">打开飞书文档</a>}
        </Space>
        {handoffNotice && <Alert type="info" message={<span role="status">{handoffNotice}</span>} />}
        <p className="review-caption">{dirty ? '有未保存的修改。' : savedStatus}</p>
      </section>
      <Modal
        open={!!manualTask}
        title="准备 Codex 任务"
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
        <p>任务与图文资料包已准备。在 Codex 粘贴任务并附上下载的 JSON 文件，即可生成飞书云文档。</p>
        <label htmlFor="review-result-file">Codex 完成后，选择同版本结果包回填</label>
        <input id="review-result-file" type="file" accept="application/json,.json" disabled={disabled || dirty || !revision} onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { if (f.size > 7000000) setError('结果文件过大'); else importResult(await f.text()); } }} />
        <Input.TextArea aria-label="Skill 任务文本" readOnly value={manualTask} rows={12} onFocus={(e) => e.target.select()} />
      </Modal>
      <Modal
        className={`notebook-preview-modal${preview ? ' notebook-preview-open' : ''}`}
        open={preview}
        destroyOnClose
        title={content.public.title || `${date}复盘`}
        width={1000}
        onCancel={() => setPreview(false)}
        footer={(
          <Space wrap>
            <Button onClick={() => setPreview(false)}>关闭</Button>
            <Button type="primary" loading={copying} onClick={copy}>{`复制到${targetNames[target]}`}</Button>
          </Space>
)}
      >
        {!article.body.trim() && <Alert type="info" message="当前只包含记录与配图。点击“智能复盘”即可生成正文。" />}
        <div className="notebook-copy-target">
          <label htmlFor="review-copy-target">粘贴到</label>
          <Select id="review-copy-target" value={target} disabled={copying} style={{ width: 160 }} options={Object.entries(targetNames).map(([value, label]) => ({ value, label }))} onChange={(value: ArticleTarget) => { setTarget(value); setCopyNotice(''); }} />
          <span className="review-caption">预览和复制使用相同排版，图片保持原比例。</span>
        </div>
        {!!copyNotice && <Alert type="info" message={<span role="status">{copyNotice}</span>} />}
        <div className="notebook-article-preview" dangerouslySetInnerHTML={{ __html: html }} />
        {!!article.images.length && <Collapse ghost items={[{ key: 'originals', label: `原图（${article.images.length} 张，粘贴缺图时使用）`, children: <Space direction="vertical">{article.images.map((image, index) => <a key={image.id} href={image.data} download={`${date}-${index + 1}.${image.data.startsWith('data:image/png') ? 'png' : 'jpg'}`}>{`${index + 1}. ${image.caption || '配图'}：下载原图`}</a>)}</Space> }]} />}
      </Modal>
    </div>
  );
}
