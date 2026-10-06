/* eslint-disable no-await-in-loop */
import axios from 'axios';

const dashed = (value: unknown) =>
  String(value).replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3');

/** Public Eastmoney announcement catalogue. Refuse truncated or repeated pages. */
export async function publicAnnouncements(
  params: Record<string, unknown>,
  get: typeof axios.get = axios.get,
) {
  const code = String(params.ts_code || '');
  const start = dashed(params.start_date);
  const end = dashed(params.end_date);
  if (
    !/^\d{6}\.(SH|SZ|BJ)$/.test(code) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(start) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(end)
  )
    throw new Error('公告参数无效');
  const output: any[][] = [];
  const seen = new Set<string>();
  let total: number | undefined;
  for (let page = 1; page <= 20; page += 1) {
    const response = await get(
      'https://np-anotice-stock.eastmoney.com/api/security/ann',
      {
        params: {
          sr: -1,
          page_size: 100,
          page_index: page,
          ann_type: 'A',
          stock_list: code.slice(0, 6),
          begin_time: start,
          end_time: end,
        },
        timeout: 15000,
        maxContentLength: 4 * 1024 * 1024,
        maxRedirects: 0,
      },
    );
    const { data } = response.data || {};
    if (response.data?.success !== 1 && response.data?.success !== true)
      throw new Error('公告来源未成功');
    if (
      !Array.isArray(data?.list) ||
      !Number.isInteger(Number(data.total_hits)) ||
      Number(data.total_hits) < 0 ||
      Number(data.page_index) !== page
    )
      throw new Error('公告来源结构异常');
    if (total !== undefined && total !== Number(data.total_hits))
      throw new Error('公告分页在读取期间变化，请重试');
    total = Number(data.total_hits);
    if (total > 2000) throw new Error('公告数量超过单次核验上限');
    data.list.forEach((r: any) => {
      if (
        !/^AN\d+$/.test(r.art_code) ||
        !Array.isArray(r.codes) ||
        !r.codes.some((s: any) => s.stock_code === code.slice(0, 6)) ||
        typeof r.title !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}/.test(r.notice_date)
      )
        throw new Error('公告条目无效');
      if (seen.has(r.art_code)) throw new Error('公告分页重复');
      seen.add(r.art_code);
      const date = r.notice_date.slice(0, 10);
      if (date < start || date > end)
        throw new Error('公告返回日期超出请求范围');
      output.push([
        code,
        date.replace(/-/g, ''),
        r.title,
        `https://data.eastmoney.com/notices/detail/${code.slice(0, 6)}/${
          r.art_code
        }.html`,
        r.display_time || null,
      ]);
    });
    if (seen.size === total)
      return {
        code: 0,
        data: {
          fields: ['ts_code', 'ann_date', 'title', 'url', 'rec_time'],
          items: output,
        },
      };
    if (!data.list.length || seen.size > total)
      throw new Error('公告分页不完整');
  }
  throw new Error('公告分页超出上限');
}
