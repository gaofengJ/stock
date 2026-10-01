/** Convert Sina's public website feed to the same bounded JSON Feed shape as RSSHub. */
export function sinaFlashItems(data: any): unknown[] {
  const result = data?.result;
  if (
    ![0, '0'].includes(result?.status?.code) ||
    !Array.isArray(result?.data?.feed?.list)
  )
    throw new Error('Invalid Sina flash feed');
  return result.data.feed.list.slice(0, 30).map((item: any) => {
    const id = Number(item.id);
    const time = item.create_time;
    const date =
      typeof time === 'string' &&
      /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(time)
        ? `${time.replace(' ', 'T')}+08:00`
        : undefined;
    return {
      id: Number.isSafeInteger(id) && id > 0 ? String(id) : undefined,
      content_html: item.rich_text,
      date_published: date,
      url:
        Number.isSafeInteger(id) && id > 0
          ? `https://wap.cj.sina.cn/pc/7x24/${id}`
          : undefined,
    };
  });
}
