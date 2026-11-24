import { createHash } from 'crypto';
import { hydrateNotebookAssets } from './notebook-assets';
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

  it('stores deduplicated public images and hydrates owner-scoped snapshots', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ generation: 0 }])
      .mockResolvedValueOnce([{ content: JSON.stringify(content()) }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const service = new NotebookService(
      {
        transaction: (run: any) => run({ query }),
      } as any,
      { report: jest.fn() },
    );
    await service.recordPublication(17, {
      date: '2026-09-30',
      revision: 2,
      channel: 'xueqiu',
      url: 'https://xueqiu.com/123/456',
    });
    expect(query.mock.calls[2][1]).toEqual([17, '2026-09-30', 2]);
    const body = query.mock.calls[5][1][5];
    const imageRefs = query.mock.calls[5][1][6];
    const hash = createHash('sha256').update(png).digest('hex');
    expect(imageRefs).toContain(`review-asset:${hash}`);
    const imageQuery = jest.fn().mockResolvedValue([{ hash, data: png }]);
    expect(
      (
        await hydrateNotebookAssets(
          { query: imageQuery },
          17,
          [],
          [{ body, imageRefs }],
        )
      ).bodies[0],
    ).toContain(png);
    expect(imageQuery.mock.calls[0][1]).toEqual([17, hash]);
    expect(body).not.toContain('PRIVATE_SENTINEL');
  });

  it('saves notes against their locked revision while retaining unreadable image references', async () => {
    const old = content();
    old.article.images[0].data = `review-asset:${'a'.repeat(64)}`;
    const query = jest
      .fn()
      .mockResolvedValue([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ generation: 2 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ revision: 3, content: JSON.stringify(old) }]);
    const service = new NotebookService(
      { transaction: (run: any) => run({ query }) } as any,
      { report: jest.fn() },
    );
    const patch = { private: { marketJudgment: '新判断' }, public: {} };
    const dto = {
      mode: 'record' as const,
      date: '2026-10-23',
      generation: 2,
      revision: 3,
      content: JSON.stringify(patch),
    };
    await expect(service.save(17, dto)).resolves.toEqual({ revision: 4 });
    const saved = JSON.parse(query.mock.calls[4][1][1]);
    expect(saved.article).toEqual(old.article);
    expect(saved.private.marketJudgment).toBe('新判断');
    expect(query.mock.calls[5][1][3]).toEqual(query.mock.calls[4][1][1]);
    expect(query.mock.calls[3][1]).toEqual([17, dto.date]);
    expect(
      query.mock.calls.some(([sql]) => sql.includes('t_review_image')),
    ).toBe(false);

    query
      .mockReset()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ generation: 2 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ revision: 4 }]);
    await expect(service.save(17, dto)).rejects.toThrow('新版本');
    expect(query).toHaveBeenCalledTimes(4);
  });

  it('rejects a newly selected stock that fails the daily report before taking a write lock', async () => {
    const transaction = jest.fn();
    const report = jest.fn().mockResolvedValue({
      items: [
        { tsCode: '000001.SZ', capState: 'over', risk: { state: 'pending' } },
        {
          tsCode: '000002.SZ',
          capState: 'within',
          risk: { state: 'excluded' },
        },
      ],
    });
    const service = new NotebookService({ transaction } as any, { report });
    const draft = {
      selected: ['000001.SZ', '000002.SZ'].map((tsCode) => ({
        tsCode,
        name: tsCode,
      })),
      notes: {},
      riskNotes: {},
      exit: '',
      reason: '',
      focus: '',
    };
    const dto = {
      date: '2026-10-23',
      revision: 0,
      content: JSON.stringify({
        private: {},
        public: {},
        workspace: { draft, items: [] },
      }),
    };
    await expect(service.save(17, dto)).rejects.toThrow('000001.SZ、000002.SZ');
    expect(report).toHaveBeenCalledWith(dto.date);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('finds saved observations by name or code in structured and older notebooks', async () => {
    const rows = [
      {
        date: '2026-10-23',
        revision: 2,
        picks: JSON.stringify([{ name: '测试股份', tsCode: '000001.SZ' }]),
      },
      {
        date: '2026-01-12',
        revision: 1,
        legacyEvidence: '测试股份 000001.SZ\n策略：回看',
      },
      {
        date: '2026-01-11',
        revision: 1,
        picks: '[]',
        legacyEvidence: '测试股份 000001.SZ\n策略：曾经选过',
      },
    ];
    const query = jest.fn().mockResolvedValue(rows);
    const service = new NotebookService({ query } as any, {
      report: jest.fn(),
    });
    const matches = await Promise.all(
      ['测试股', '000001.sz'].map((term) => service.list(17, term)),
    );
    matches.forEach((found) => {
      expect(found.map((row) => row.date)).toEqual([
        '2026-10-23',
        '2026-01-12',
      ]);
      expect(found[0]).not.toHaveProperty('picks');
    });
    expect(query.mock.calls[0][1]).toEqual([17]);
  });

  it('rejects a source-date mismatch before entering the save transaction', async () => {
    const transaction = jest.fn();
    const service = new NotebookService({ transaction } as any, {
      report: jest.fn(),
    });
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
    const service = new NotebookService({ transaction } as any, {
      report: jest.fn(),
    });
    expect(await service.clear(17)).toEqual({
      t_review_publication: 3,
      t_review_notebook_version: 3,
      t_review_notebook: 3,
      t_review_image: 3,
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
    const service = new NotebookService(
      {
        transaction: (run: (manager: any) => Promise<unknown>) =>
          run({ query }),
      } as any,
      { report: jest.fn() },
    );
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
