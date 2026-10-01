import { metadata } from '../../scripts/article-metadata.cjs';

const escape = (value: unknown) => String(value || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export default function articlePlugin(md: any) {
  const render = md.renderer.render.bind(md.renderer);
  md.renderer.render = (tokens: any[], options: any, env: any) => {
    const html = render(tokens, options, env);
    if (!env.relativePath || !env.frontmatter) return html;
    if (env.relativePath.includes('/reports/')) return `<div data-pagefind-ignore="all">${html}</div>`;
    if (env.relativePath.endsWith('index.md')) return html;
    const m = metadata(env.relativePath, env.frontmatter, env.frontmatter.title || env.title);
    const fields = `<span hidden data-pagefind-filter="分类" data-pagefind-meta="category">${escape(m.category)}</span><span hidden data-pagefind-filter="年份" data-pagefind-meta="year">${escape(m.year)}</span><span hidden data-pagefind-meta="date">${escape(m.date || '日期未标注')}</span><span hidden data-pagefind-meta="source">${escape(m.source)}</span>`;
    const source = m.sourceUrl ? `<a href="${escape(m.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escape(m.source)} · 原文</a>` : escape(m.source);
    const dates = `${m.date ? ` · ${m.category === '复盘文档' ? '复盘日期' : '发布日期'}：${escape(m.date)}` : ' · 日期未标注'}${m.published && m.published !== m.date ? ` · 发布：${escape(m.published)}` : ''}`;
    const ruleNote = m.category === '交易规则' ? '<p class="article-rule-note">历史整理资料，尚未逐条核验现行条款。<a href="https://www.sse.com.cn/lawandrules/sselawsrules2025/stocks/exchange/" target="_blank" rel="noopener noreferrer">上交所规则</a> · <a href="https://investor.szse.cn/lawrules/rule/trade/t20260424_620190.html" target="_blank" rel="noopener noreferrer">深交所规则</a></p>' : '';
    return `${fields}<div class="article-metadata" data-pagefind-ignore><p>${escape(m.category)} · ${source}${dates}</p>${ruleNote}</div>${html}`;
  };
}
