'use client';

/* eslint-disable react/no-danger, react/jsx-closing-tag-location -- HTML is produced by the escaping renderer; local raster images use data URLs. */
/* eslint jsx-a11y/label-has-associated-control: ["error", { "assert": "htmlFor" }] */
import { useRef, useState } from 'react';
import Link from 'next/link';
import {
  Alert, Button, Checkbox, Collapse, Input, Modal, Select, Space,
} from 'antd';
import { PrepareAnalysis } from '@/components/PersonalAi/AnalysisPanel';
import BusinessAction from '@/components/PersonalAi/BusinessAction';
import { Task } from '@/components/PersonalAi/client';
import { copyText } from '@/utils/clipboard';
import { siteUrl } from '@/discovery/site';
import {
  Article, ArticleImage, emptyArticle, illustratedText, validateArticle,
} from './article-contract';
import {
  ArticleTarget, articlePlainText, documentTemplate, NotebookContent, SavedNotebook, noteHtml, publicText, reviewDocument, notesSignature, currentArticleBody, nativeAnswer,
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
  date, revision, content, disabled, dirty, onSave, generation = 0, previewDisabled = false, onChange, onMaterials, onStatus: reportStatus, prepareImages, openRequest = 0,
}: {
  prepareImages: PrepareAnalysis; openRequest?: number;
  date: string; revision: number; generation?: number; content: NotebookContent; disabled: boolean; dirty: boolean;
  onSave: () => Promise<SavedNotebook | null>;
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
  const [editBody, setEditBody] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [proposal, setProposal] = useState<{ answer: string; taskId: string; body: string } | null>(null);
  const [undo, setUndo] = useState<Article | null>(null);
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
      setUndo(current.current); onChange(imported); setImportOpen(false); setError(''); setHandoffNotice(''); onStatus('成稿与图片已导入，预览确认后点击“保存”。');
    } catch (e) { setError((e as Error).message); }
  };
  return (
    <div className="notebook-panel notebook-article-editor">
      <div className="notebook-panel-intro">
        <p>{`${article.body.trim() ? '图文已生成' : '尚未生成 AI 正文'}，已收录 ${article.images.length} 张图片。`}</p>
      </div>
      {error && <Alert type="error" message={error} />}
      {notice && <Alert type="info" message={notice} />}
      <section className="notebook-handoff" aria-label="保存与 AI 整理">
        <Space wrap size={12}>
          <BusinessAction
            compact
            openRequest={openRequest}
            skill="market-review"
            date={date}
            disabled={disabled || pending || handoffBusy}
            beforeStart={prepareImages}
            canApplySections={!!article.composition && /^### 核心判断\s*$/m.test(article.composition.answer)}
            onComplete={(task: Task, selectedSection?: string) => {
              if (task.date !== context.current.date) throw Error('日期已切换，结果保留在分析记录中。');
              const latest = currentContent.current;
              let answer = task.answer || '';
              if (selectedSection && latest.article?.composition) {
                const extract = (text: string) => new Map(text.split(/^### /m).slice(1).map((block) => { const index = block.indexOf('\n'); return [block.slice(0, index).trim(), block.slice(index).trim()]; }));
                const old = extract(latest.article.composition.answer); const incoming = extract(answer);
                if (!incoming.get(selectedSection)) throw Error('所选章节没有可用结果');
                old.set(selectedSection, incoming.get(selectedSection)!);
                answer = [...old].map(([heading, body]) => `### ${heading}\n\n${body}`).join('\n\n');
              }
              const body = reviewDocument(date, latest, answer);
              setProposal({ answer, taskId: task.id, body });
            }}
          />

          <Button disabled={previewDisabled || handoffBusy} onClick={() => { setCopyNotice(''); setPreview(true); }}>预览</Button>
          {article.feishuUrl && <a href={article.feishuUrl} target="_blank" rel="noopener noreferrer">打开飞书文档</a>}
        </Space>
        {!!missingImages.length && <p className="review-caption">生成时会补齐缺少的配图；已收录的图片直接复用。</p>}
        <Checkbox disabled={disabled} checked={materials.includeExecution} onChange={(e) => onMaterials({ ...materials, includeExecution: e.target.checked })}>文档包含持仓与操作记录</Checkbox>
        <Collapse items={[{
          key: 'external',
          label: '使用 Codex 生成飞书文档（可选）',
          children: <Space wrap size={12}>
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
                  const packet = reviewPacket(saved.date, saved.revision, saved.content, siteUrl, saved.generation);
                  const prompt = `使用 $stock-review-feishu 生成 ${saved.date} 的飞书图文复盘。网站：${siteUrl}/review/?date=${saved.date}，保存版本 ${saved.revision}。使用随任务附上的图文资料包（stock-review/v2）；如未附上，请先索取资料包。保留资料包 userNotes 的非空原文，并另外写 AI 独立分析，空白不能当作空仓或无交易。标题默认 ${saved.content.public.title || `${saved.date}复盘`}；优先使用已有平台图片；缺少市场概览、情绪指标、连板分析、20日板块轮动或全部涨停长图时，按资料链接补取五张暗色长图，不重复取已有图片。开头声明本文由AI生成，仅供参考。正文依次为核心判断、市场与情绪、主线与梯队、板块多周期对照、后续验证。以关联证据组织分析；板块从当日、5日、20日领先及分歧方向选3至5个，在一张表并列比较三个周期，缺值注明缺失，不堆三套榜单。先文字后相关配图，20日轮动图只作中期背景。策略选股只列股票名和策略标签；闲聊默认空白；二级标题之间留空行；不单列明日计划。正常目标10分钟，20分钟硬停止并保留可续接进度。已有 ${saved.content.article?.images.length || 0} 张图片，仅在缺少必需图片时按 materials.links 补取，最终必须嵌入真实图片。完成后用同日期和版本的结果包通过“导入 Codex 结果”选择结果包回填，再保存记录。不得覆盖用户原文。执行记录授权：${saved.content.materials?.includeExecution ? '仅限私人飞书文档' : '未包含，不读取'}。本次任务由 Codex 执行并生成飞书云文档。\n\n用户记录：\n${JSON.stringify(packet.userNotes)}\n\n图片来源：\n${JSON.stringify(packet.materials.links)}`;
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
            <Button disabled={disabled || pending || handoffBusy || !revision} onClick={() => { setError(''); setImportOpen(true); }}>导入 Codex 结果</Button>
          </Space>,
        }]}
        />
        {handoffNotice && <Alert type="info" message={<span role="status">{handoffNotice}</span>} />}
        {!!article.body && !article.composition && <Alert type="warning" message="此正文来自旧版本或外部导入，修改个人记录后请核对正文再复制" action={<Button onClick={() => { const answer = nativeAnswer(article.body); if (answer) setProposal({ answer, taskId: 'legacy', body: reviewDocument(date, currentContent.current, answer) }); else setEditBody(true); }}>核对并同步原文</Button>} />}
        {article.composition?.taskId && article.composition.taskId !== 'legacy' && <Link href={`/review/?view=article&date=${date}&aiTask=${encodeURIComponent(article.composition.taskId)}`}>查看上次应用的 AI 结果</Link>}
        {article.composition && article.composition.notesSignature !== notesSignature(content) && <Alert type="info" message="预览已同步最新原文，AI 分析保持不变；保存后同步服务器正文" />}
        {undo && (
        <Button onClick={() => {
          update({
            ...current.current, body: undo.body, composition: undo.composition, feishuUrl: undo.feishuUrl,
          }); setUndo(null); onStatus('已撤销上次正文应用，请保存');
        }}
        >
          撤销上次正文应用
        </Button>
        )}
        <p className="review-caption">{dirty ? '有未保存的修改。' : savedStatus}</p>
      </section>
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

      <Modal
        className="review-dialog"
        centered
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
        <p>Codex 完成后，关闭此窗口，通过“导入 Codex 结果”回填，无需重新准备任务。</p>
        <Input.TextArea aria-label="Skill 任务文本" readOnly value={manualTask} rows={12} onFocus={(e) => e.target.select()} />
      </Modal>
      <Modal className="review-dialog" centered title="导入 Codex 结果" open={importOpen} onCancel={() => setImportOpen(false)} footer={<Button onClick={() => setImportOpen(false)}>关闭</Button>}>
        <p>
          当前日期
          {date}
          ，服务器版本
          {revision}
          。选择同日期、同版本结果包，导入后预览并保存。
        </p>
        {dirty && <Alert type="warning" message="当前有未保存修改，请先保存后再导入匹配版本" />}
        {error && <Alert type="error" message={error} />}
        <label htmlFor="review-result-file">选择 Codex 结果包</label>
        <input id="review-result-file" type="file" accept="application/json,.json" disabled={disabled || dirty || !revision} onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { if (f.size > 7000000) setError('结果文件过大'); else importResult(await f.text()); } }} />
      </Modal>
      <Modal className="review-dialog" centered title="核对外部正文与当前原文" width={1000} open={editBody} onCancel={() => setEditBody(false)} footer={<Button onClick={() => setEditBody(false)}>完成核对</Button>}>
        <p>此正文没有可分离的原生 AI 章节，请对照当前原文手动调整。修改会保留在草稿，保存后才同步服务器。</p>
        <div className="review-result-diff">
          <pre>{Object.entries(content.private).filter(([, text]) => text.trim()).map(([key, text]) => `${key}：${text}`).join('\n\n')}</pre>
          <Input.TextArea aria-label="编辑外部正文" rows={20} maxLength={300000} value={article.body} onChange={(event) => update({ ...article, body: event.target.value })} />
        </div>
      </Modal>
      <Modal
        className="review-dialog"
        centered
        title="核对 AI 结果后应用"
        width={1000}
        open={!!proposal}
        onCancel={() => setProposal(null)}
        footer={(
          <Space wrap>
            <Button onClick={() => setProposal(null)}>保留原稿</Button>
            <Button type="primary" onClick={() => { if (!proposal) return; const latest = currentContent.current; setUndo(current.current); update({ ...(latest.article || emptyArticle()), body: reviewDocument(date, latest, proposal.answer), composition: { answer: proposal.answer, taskId: proposal.taskId, notesSignature: notesSignature(latest) } }); setProposal(null); onStatus('已应用到当前复盘，可撤销。预览后保存即可同步服务器。'); }}>应用到当前复盘</Button>
          </Space>
)}
      >
        <p>只替换所选 AI 分析，个人记录与配图保留。此操作不会立即保存服务器。</p>
        <div className="review-result-diff">
          <section>
            <h3>当前正文</h3>
            <pre>{currentArticleBody(date, content) || '尚无正文'}</pre>
          </section>
          <section>
            <h3>应用后正文</h3>
            <pre>{proposal?.body}</pre>
          </section>
        </div>
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
        {!article.body.trim() && <Alert type="info" message="当前只包含记录与配图。点击“生成复盘”即可生成正文。" />}
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
