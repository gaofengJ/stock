const CATEGORIES = {
  'trading-rules': '交易规则', technical: '技术分析', thematic: '题材逻辑',
  'sentiment-cycle': '情绪周期', 'risk-management': '风险管控', reviews: '复盘文档',
};
function date(value) {
  const match = String(value || '').match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  return match ? `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}` : '';
}
function metadata(relativePath, frontmatter = {}, title = '') {
  const category = CATEGORIES[relativePath.split('/')[0]] || '资料首页';
  const published = date(frontmatter.published_at || frontmatter.date);
  const reviewDate = category === '复盘文档' ? date(title) : '';
  const sourceUrl = /^https:\/\//.test(frontmatter.source_url || '') ? frontmatter.source_url : '';
  const source = sourceUrl.includes('xueqiu.com/') ? '雪球 · 爱在冰川'
    : sourceUrl.includes('mp.weixin.qq.com/') ? '微信 · 爱在冰川'
      : sourceUrl ? '原文来源' : '本站整理';
  return { category, date: reviewDate || published, published, year: (reviewDate || published).slice(0, 4) || '未标注', source, sourceUrl };
}
function frontmatter(source) {
  const block = source.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] || '';
  const values = {};
  for (const line of block.split(/\r?\n/)) {
    const match = line.match(/^([\w_]+):\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (value.startsWith('"')) { try { value = JSON.parse(value); } catch { /* Keep unparsed legacy text. */ } }
    values[match[1]] = value;
  }
  return values;
}
module.exports = { CATEGORIES, metadata, frontmatter };
