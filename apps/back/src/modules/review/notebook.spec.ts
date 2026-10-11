import { parseNotebook } from './notebook.content';
import { NotebookService } from './notebook.service';
import { fastifyApp } from '../../adapters/fastify.adapters';

const png =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=';
const content = () => ({
  private: { execution: 'PRIVATE_SENTINEL' },
  public: {},
  article: {
    body: '# Public\n## Market\nVerified facts',
    feishuUrl: '',
    images: [
      {
        id: 'chart-1',
        data: png,
        after: 'Market',
        caption: 'Market chart',
        source: '2026-09-30',
      },
    ],
  },
});

describe('illustrated notebook', () => {
  it('retains old fields and validates media without admitting private fields to an article', () => {
    const parsed = parseNotebook(JSON.stringify(content()));
    expect(parsed.private.execution).toBe('PRIVATE_SENTINEL');
    expect(parsed.article!.images[0].data).toBe(png);
    expect(() =>
      parseNotebook(JSON.stringify({ ...content(), secret: 'unexpected' })),
    ).toThrow();
    expect(() =>
      parseNotebook(
        JSON.stringify({
          ...content(),
          article: {
            ...content().article,
            images: [
              {
                ...content().article.images[0],
                data: 'data:image/svg+xml;base64,PHN2Zz4=',
              },
            ],
          },
        }),
      ),
    ).toThrow();
  });

  it('records self-contained public image snapshots and preserves ownership filters', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ content: JSON.stringify(content()) }])
      .mockResolvedValueOnce([]);
    const service = new NotebookService({ query } as any);
    await service.recordPublication(17, {
      date: '2026-09-30',
      revision: 2,
      channel: 'xueqiu',
      url: 'https://xueqiu.com/123/456',
    });
    expect(query.mock.calls[0][1]).toEqual([17, '2026-09-30', 2]);
    const body = query.mock.calls[1][1][5];
    expect(body).toContain(png);
    expect(body).not.toContain('PRIVATE_SENTINEL');
  });

  it('rejects a source-date mismatch before entering the save transaction', async () => {
    const transaction = jest.fn();
    const service = new NotebookService({ transaction } as any);
    await expect(
      service.save(17, {
        date: '2026-09-30',
        revision: 2,
        content: JSON.stringify({
          ...content(),
          research: {
            date: '2026-09-29',
            fetchedAt: new Date().toISOString(),
            sections: [],
          },
        }),
      }),
    ).rejects.toThrow('日期');
    expect(transaction).not.toHaveBeenCalled();
  });

  it('accepts illustrated payloads only at the notebook route and retains default limits elsewhere', async () => {
    const app = fastifyApp.getInstance();
    app.post('/api/review/notebook', async () => ({ ok: true }));
    app.post('/api/other', async () => ({ ok: true }));
    try {
      const payload = { content: 'x'.repeat(2 * 1024 * 1024) };
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/review/notebook',
            payload,
          })
        ).statusCode,
      ).toBe(200);
      expect(
        (await app.inject({ method: 'POST', url: '/api/other', payload }))
          .statusCode,
      ).toBe(413);
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/review/notebook',
            payload: { content: 'x'.repeat(9 * 1024 * 1024) },
          })
        ).statusCode,
      ).toBe(413);
    } finally {
      await app.close();
    }
  });
});

describe('notebook history reset', () => {
  it('deletes only the selected owner in one transaction and advances draft generation', async () => {
    const query = jest.fn(async (sql: string, params: number[]) => {
      expect(params).toEqual([17]);
      return sql.startsWith('DELETE') ? { affectedRows: 3 } : [];
    });
    const transaction = jest.fn((run) => run({ query }));
    const service = new NotebookService({ transaction } as any);
    expect(await service.clear(17)).toEqual({
      t_review_publication: 3,
      t_review_notebook_version: 3,
      t_review_notebook: 3,
    });
    expect(transaction).toHaveBeenCalledTimes(1);
    query.mock.calls.forEach((call) => {
      expect(call[1]).toEqual([17]);
      if (call[0].startsWith('DELETE'))
        expect(call[0]).toMatch(/WHERE user_id=\?$/);
    });
    expect(query.mock.calls.at(-1)![0]).toContain('generation=generation+1');
  });
  it('rejects a stale browser after a clear before inserting any notebook content', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ generation: 1 }]);
    const service = new NotebookService({
      transaction: (run: (manager: any) => Promise<unknown>) => run({ query }),
    } as any);
    await expect(
      service.save(17, {
        date: '2026-10-12',
        revision: 0,
        generation: 0,
        content: JSON.stringify(content()),
      }),
    ).rejects.toThrow('已清空');
    expect(query).toHaveBeenCalledTimes(2);
  });
});
