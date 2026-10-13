import { createHash } from 'crypto';
import { hydrateNotebookAssets } from './notebook-assets';
import { parseNotebook } from './notebook.content';

const png =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=';
const hash = createHash('sha256').update(png).digest('hex');
const marker = `review-asset:${hash}`;
const snapshot = (data: string) =>
  JSON.stringify({
    private: { lesson: `literal ${marker}` },
    public: { summary: marker },
    article: {
      body: `# Literal ${marker}`,
      feishuUrl: '',
      images: [{ id: 'one', data, caption: marker, source: '', after: '' }],
    },
  });

describe('structured notebook assets', () => {
  it('never interprets user text or legacy publication bodies as image references', async () => {
    const query = jest.fn();
    const raw = snapshot(png);
    const body = `literal ${marker}`;
    const result = await hydrateNotebookAssets(
      { query },
      17,
      [raw],
      [{ body }],
    );
    expect(result.notebooks).toEqual([raw]);
    expect(result.bodies).toEqual([body]);
    expect(parseNotebook(result.notebooks[0]).private.lesson).toContain(marker);
    expect(query).not.toHaveBeenCalled();
  });

  it('loads all snapshots and publication images in one owner-scoped query', async () => {
    const query = jest.fn().mockResolvedValue([{ hash, data: png }]);
    const result = await hydrateNotebookAssets(
      { query },
      17,
      [snapshot(marker), snapshot(marker)],
      [
        {
          body: `Literal ${marker}\n![Chart](review-image:one)\n![Other](review-image:one-other)`,
          imageRefs: JSON.stringify([{ id: 'one', data: marker }]),
        },
      ],
    );
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][1]).toEqual([17, hash]);
    result.notebooks.forEach((raw) => {
      const parsed = parseNotebook(raw);
      expect(parsed.article!.images[0].data).toBe(png);
      expect(parsed.article!.images[0].caption).toBe(marker);
      expect(parsed.private.lesson).toContain(marker);
    });
    expect(result.bodies[0]).toBe(
      `Literal ${marker}\n![Chart](${png})\n![Other](review-image:one-other)`,
    );
  });

  it('does not resolve another owner image when an asset is absent', async () => {
    await expect(
      hydrateNotebookAssets({ query: jest.fn().mockResolvedValue([]) }, 18, [
        snapshot(marker),
      ]),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('retains the complete long-form tool evidence and article', () => {
    const raw = JSON.parse(snapshot(png));
    raw.private.toolEvidence = '候'.repeat(200000);
    raw.article.body = raw.private.toolEvidence + '稿'.repeat(100000);
    expect(parseNotebook(JSON.stringify(raw)).article!.body).toBe(
      raw.article.body,
    );
    raw.article.body += '超';
    expect(() => parseNotebook(JSON.stringify(raw))).toThrow();
  });
});
