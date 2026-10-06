import axios from 'axios';

export const unpublishedCalendar = 'calendar_unpublished';
export class CalendarUnpublishedError extends Error {}

/** The public endpoint declares GB2312; decoding bytes avoids irreversible replacement characters. */
export function decodeInvestmentCalendar(bytes: Uint8Array, contentType = '') {
  const charset = contentType.match(/charset\s*=\s*["']?([\w-]+)/i)?.[1];
  const encoding = /^(gb2312|gbk|gb18030)$/i.test(charset || '')
    ? 'gb18030'
    : charset || 'utf-8';
  let body: string;
  try {
    body = new TextDecoder(encoding, { fatal: true }).decode(bytes);
  } catch (error) {
    if (charset) throw error;
    body = new TextDecoder('gb18030', { fatal: true }).decode(bytes);
  }
  if (body.includes('\uFFFD')) throw new Error('投资日历编码异常');
  return body;
}

/** Parse the public page's JSONP as data, never execute callback code. */
export function investmentRows(body: unknown) {
  if (typeof body !== 'string') throw new Error('投资日历结构异常');
  const match = body.trim().match(/^calendar\((\{[\s\S]*\})\);?$/);
  if (!match) throw new Error('投资日历结构异常');
  const payload = JSON.parse(match[1]);
  if (payload.stat === 'err' && payload.msg === '数据不存在或还未生成')
    throw new CalendarUnpublishedError('日程尚未发布');
  if (payload.stat !== 'ok' || !Array.isArray(payload.data))
    throw new Error('投资日历未就绪');
  const rows = new Map<string, Record<string, any>>();
  payload.data.forEach((day: any) => {
    const timestamp = Date.parse(`${day.date}T00:00:00Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(day.date) ||
      !Number.isFinite(timestamp) ||
      new Date(timestamp).toISOString().slice(0, 10) !== day.date ||
      !Array.isArray(day.events)
    )
      throw new Error('投资日历日期异常');
    day.events.forEach((event: any, i: number) => {
      if (!Array.isArray(event) || typeof event[0] !== 'string')
        throw new Error('投资日历事件异常');
      const title = event[0].trim();
      if (title.includes('\uFFFD')) throw new Error('投资日历编码异常');
      if (!title) return;
      const sectors = [...(day.concept?.[i] || []), ...(day.field?.[i] || [])]
        .map((r: any) => r.name)
        .filter((v: unknown) => typeof v === 'string');
      if (sectors.some((v: string) => v.includes('\uFFFD')))
        throw new Error('投资日历编码异常');
      const key = `${day.date}:${title}`;
      const old = rows.get(key);
      rows.set(key, {
        date: day.date,
        title,
        importance:
          Number(day.import) >= 1
            ? Math.min(3, Math.floor(Number(day.import)))
            : null,
        sectors: [...new Set([...(old?.sectors || []), ...sectors])],
      });
    });
  });
  return [...rows.values()];
}

export async function publicInvestmentCalendar(
  params: Record<string, unknown>,
) {
  if (!/^\d{6}$/.test(String(params.month))) throw new Error('日历月份异常');
  const response = await axios.get(
    'https://comment.10jqka.com.cn/tzrl/getTzrlData.php',
    {
      params: { type: 'data', date: params.month, callback: 'calendar' },
      timeout: 10000,
      maxContentLength: 2 * 1024 * 1024,
      responseType: 'arraybuffer',
    },
  );
  const rows = investmentRows(
    decodeInvestmentCalendar(response.data, response.headers['content-type']),
  );
  const fields = ['date', 'title', 'importance', 'sectors'];
  return {
    code: 0,
    data: { fields, items: rows.map((r) => fields.map((f) => r[f])) },
  };
}

export function investmentCategory(title: string) {
  if (
    /展览|展会|博览|博会|CES|MWC|发布会|开发者|科技|创新|人工智能|机器人|算力/.test(
      title,
    )
  )
    return '科技与展会';
  if (
    /两会|政协|人大|中央|国务院|政策|法规|规定|条例|国家标准|央行|联储|议息|利率决议/.test(
      title,
    )
  )
    return '政策与会议';
  if (
    /CPI|PPI|PMI|GDP|非农|失业|通胀|经济数据|物价|贸易|就业|零售|制造业指数/.test(
      title,
    )
  )
    return '经济数据';
  return '其他事件';
}
