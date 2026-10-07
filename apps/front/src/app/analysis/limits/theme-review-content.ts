/** Keep the provider's wording; only separate sections and move source prefixes. */
export function reviewContent(value: string | null | undefined) {
  const company: string[] = [];
  const industry: string[] = [];
  const disclaimer: string[] = [];
  let section = company;
  (value || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean).forEach((line) => {
    if (/^公司原因[：:]?$/.test(line)) section = company;
    else if (/^行业原因[：:]?$/.test(line)) section = industry;
    else if (/^[（(]?免责声明[：:]/.test(line)) disclaimer.push(line);
    else section.push(line.replace(/^\d+(?:[、．]|\.(?!\d))\s*/, ''));
  });
  return { company, industry, disclaimer };
}

export function reviewPoint(value: string) {
  const prefix = value.match(/^(据\d{4}年[^，\n]{1,70})，(.+)$/);
  return prefix ? { text: prefix[2], source: prefix[1] } : { text: value, source: '' };
}

export function reviewSummary(value: string | null | undefined) {
  const first = reviewContent(value).company[0];
  return first ? reviewPoint(first).text : '';
}
