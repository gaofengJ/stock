import { NewsFeatures } from './news.features';

describe('durable incremental news classification', () => {
  const item = {
    id: 10,
    title: '平安银行前三季度净利润同比增长10%',
    body: '公司公告',
    published_at: '2026-10-23T08:00:00Z',
    source: 'cls',
    kind: 'flash',
  };

  it('does no catalog or historical scan when the queue is empty', async () => {
    const query = jest.fn().mockResolvedValue([]);
    await new NewsFeatures({ query } as any).indexBatch();
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain('FROM t_news_index_queue');
  });

  it('acknowledges only after derived rules are stored and retries after failure', async () => {
    let queued = true;
    let fail = true;
    const query = jest.fn().mockImplementation(async (sql: string) => {
      if (sql.startsWith('SELECT') && sql.includes('FROM t_news_index_queue'))
        return queued ? [item] : [];
      if (sql.startsWith('INSERT INTO t_news_rule') && fail)
        throw new Error('temporary write failure');
      if (sql.startsWith('DELETE FROM t_news_index_queue')) queued = false;
      return [];
    });
    const features = new NewsFeatures({ query } as any);
    await expect(features.indexBatch()).rejects.toThrow('temporary');
    expect(queued).toBe(true);
    fail = false;
    await features.indexBatch();
    expect(queued).toBe(false);
    expect(query.mock.calls.at(-1)?.[0]).toBe(
      'DELETE FROM t_news_index_queue WHERE news_id=?',
    );
  });
});
