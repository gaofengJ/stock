import { DataSource } from 'typeorm';
import { LimitEntity } from '@/modules/source/limit/limit.entity';
import { LimitQueryDto } from '@/modules/source/limit/limit.dto';
import { ValidationPipe } from '@nestjs/common';
import { queryColumn } from './query-column';

describe('query field boundaries', () => {
  const db = new DataSource({
    type: 'mysql',
    database: 'metadata_only',
    entities: [LimitEntity],
  });
  beforeAll(() => (db as any).buildMetadatas());

  it('preserves both existing snake-case and property field names', () => {
    const metadata = db.getMetadata(LimitEntity);
    expect(queryColumn(metadata, 'limit_times')).toBe('limitTimes');
    expect(queryColumn(metadata, 'limitTimes')).toBe('limitTimes');
    const sql = db
      .getRepository(LimitEntity)
      .createQueryBuilder('limits')
      .orderBy(`limits.${queryColumn(metadata, 'trade_date')}`, 'DESC')
      .getSql();
    expect(sql).toContain('ORDER BY `limits`.`trade_date` DESC');
  });

  it.each([
    '(SELECT 1)',
    'ts_code DESC',
    'unknown',
    'ts_code, (SELECT 1)',
    'tsCode FROM t_user',
  ])('rejects SQL and unknown field %s', (field) => {
    expect(() => queryColumn(db.getMetadata(LimitEntity), field)).toThrow(
      '不支持',
    );
  });

  it('accepts omitted optional filters and rejects a scalar projection', async () => {
    const pipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: true },
    });
    await expect(
      pipe.transform(
        { pageNum: '1', pageSize: '10' },
        { type: 'query', metatype: LimitQueryDto },
      ),
    ).resolves.toMatchObject({ pageNum: 1 });
    await expect(
      pipe.transform(
        { fields: 'ts_code' },
        { type: 'query', metatype: LimitQueryDto },
      ),
    ).rejects.toThrow();
  });
});
