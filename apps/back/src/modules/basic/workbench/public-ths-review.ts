import axios from 'axios';

export const thsReviewUrl =
  'https://eq.10jqka.com.cn/webpage/kamis-renderer/index.0.3.5.html?token=K79OTEyOQB5';

/** The official Hot Review feed supplies editorial groups, not index memberships. */
export function thsReviewRows(payload: any, date: string) {
  if (!/^\d{8}$/.test(date)) throw new Error('同花顺复盘日期异常');
  if (payload?.status_code !== 0)
    throw new Error('同花顺复盘暂不可用或无访问权限');
  if (!Array.isArray(payload.data?.tab_list))
    throw new Error('同花顺复盘结构异常');
  const seen = new Set<string>();
  const rows: Record<string, string>[] = [];
  payload.data.tab_list.forEach((group: any) => {
    if (
      group.date !== date ||
      typeof group.tab_name !== 'string' ||
      !group.tab_name.trim() ||
      !Array.isArray(group.tab_data)
    )
      throw new Error('同花顺复盘分组或日期异常');
    group.tab_data.forEach((stock: any) => {
      if (
        !/^\d{6}\.(SH|SZ|BJ)$/.test(stock.ths_code) ||
        seen.has(stock.ths_code) ||
        typeof stock.stock_name !== 'string' ||
        (stock.abnormal_reason !== null &&
          typeof stock.abnormal_reason !== 'string') ||
        (stock.detail_reason !== null &&
          typeof stock.detail_reason !== 'string') ||
        stock.concept !== group.tab_name
      )
        throw new Error('同花顺复盘股票记录异常');
      seen.add(stock.ths_code);
      rows.push({
        ts_code: stock.ths_code,
        name: stock.stock_name.trim(),
        trade_date: date,
        theme: group.tab_name.trim(),
        lu_desc: stock.abnormal_reason?.trim() || '',
        detail_reason: stock.detail_reason?.trim() || '',
      });
    });
  });
  if (rows.length > 8000) throw new Error('同花顺复盘记录超过上限');
  return rows;
}

export async function publicThsReview(params: Record<string, unknown>) {
  const date = String(params.trade_date);
  if (!/^\d{8}$/.test(date)) throw new Error('同花顺复盘日期异常');
  // The public page gates older history. Only request its publicly listed dates.
  const recent = await axios.get(
    'https://ozone.10jqka.com.cn/open/api/draw_lots/v1/rank/list_recent_date',
    { timeout: 10000, maxContentLength: 256 * 1024, maxRedirects: 0 },
  );
  if (
    recent.data?.status_code !== 0 ||
    !Array.isArray(recent.data.data?.date_list)
  )
    throw new Error('同花顺复盘公开日期暂不可用');
  if (!recent.data.data.date_list.some((row: any) => row.date === date))
    throw new Error('同花顺复盘尚未发布或历史访问权限不足');
  const response = await axios.get(
    'https://ozone.10jqka.com.cn/open/api/draw_lots/v1/rank/all_tab_data',
    {
      params: { date },
      timeout: 10000,
      maxContentLength: 8 * 1024 * 1024,
      maxRedirects: 0,
    },
  );
  const rows = thsReviewRows(response.data, date);
  const fields = [
    'ts_code',
    'name',
    'trade_date',
    'theme',
    'lu_desc',
    'detail_reason',
  ];
  return {
    code: 0,
    data: {
      fields,
      items: rows.map((row) => fields.map((field) => row[field])),
    },
  };
}
