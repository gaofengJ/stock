import { checkNewsSchema } from './news-schema';
import { NEWS_SOURCES } from './news.sources';

const indexes = [
  {
    TABLE_NAME: 't_news_translation',
    INDEX_NAME: 'PRIMARY',
    COLUMN_NAME: 'news_id',
    NON_UNIQUE: 0,
  },
  {
    TABLE_NAME: 't_news_source',
    INDEX_NAME: 'PRIMARY',
    COLUMN_NAME: 'source',
    NON_UNIQUE: 0,
  },
  {
    TABLE_NAME: 't_news_item',
    INDEX_NAME: 'uq_news_source_key',
    COLUMN_NAME: 'source',
    NON_UNIQUE: 0,
  },
  {
    TABLE_NAME: 't_news_item',
    INDEX_NAME: 'uq_news_source_key',
    COLUMN_NAME: 'dedupe_key',
    NON_UNIQUE: 0,
  },
  {
    TABLE_NAME: 't_news_favorite',
    INDEX_NAME: 'PRIMARY',
    COLUMN_NAME: 'user_id',
    NON_UNIQUE: 0,
  },
  {
    TABLE_NAME: 't_news_favorite',
    INDEX_NAME: 'PRIMARY',
    COLUMN_NAME: 'news_id',
    NON_UNIQUE: 0,
  },
];

describe('News deployment schema', () => {
  it('rejects a deployment without the translation migration', async () => {
    const query = jest.fn().mockResolvedValue(indexes.slice(1));
    await expect(checkNewsSchema({ query })).rejects.toThrow(
      't_news_translation',
    );
  });
  it('rejects the old source catalog even when the old table indexes are present', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce(indexes)
      .mockResolvedValueOnce(
        NEWS_SOURCES.slice(0, 6).map((source) => ({ source: source.code })),
      );
    await expect(checkNewsSchema({ query })).rejects.toThrow(
      'configuration migration required',
    );
  });
  it('accepts configured sources without changing administrator switches', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce(indexes)
      .mockResolvedValueOnce(
        NEWS_SOURCES.map((source) => ({ source: source.code, enabled: 0 })),
      );
    await expect(checkNewsSchema({ query })).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledTimes(2);
  });
});
