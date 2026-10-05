import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CandidateDetailsDto } from './insight.dto';

describe('candidate GET query validation', () => {
  test('accepts a bounded comma-separated candidate list', async () => {
    const query = plainToInstance(
      CandidateDetailsDto,
      { date: '2026-09-30', codes: '000503.SZ,600429.SH' },
      { enableImplicitConversion: true },
    );
    expect(await validate(query)).toEqual([]);
    expect(query.codes).toEqual(['000503.SZ', '600429.SH']);
  });
  test.each(['', '000503.SZ,invalid', '000503.SZ,000503.SZ'])(
    'rejects malformed/duplicate codes: %s',
    async (codes) => {
      const query = plainToInstance(
        CandidateDetailsDto,
        { date: '2026-09-30', codes },
        { enableImplicitConversion: true },
      );
      expect((await validate(query)).length).toBeGreaterThan(0);
    },
  );
});
