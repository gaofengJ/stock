import { DataSource } from 'typeorm';
import { TushareService } from '@/shared/tushare/tushare.service';
import { MarketService } from './market.service';

describe('Market status date-specific update times', () => {
  it('preserves each published date timestamp instead of applying the latest one to history', async () => {
    const rows = [
      { date: '2026-09-24', updatedAt: new Date('2026-09-27T14:25:00Z') },
      { date: '2024-09-24', updatedAt: new Date('2026-09-26T10:00:00Z') },
    ];
    const db = {
      query: jest.fn().mockResolvedValueOnce(rows).mockResolvedValueOnce([]),
      manager: {
        findOne: jest.fn().mockResolvedValue({ calDate: '2026-09-24' }),
        findBy: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new MarketService(
      db as unknown as DataSource,
      {} as TushareService,
    );
    const status = await service.status();
    expect(status.latestDate).toBe('2026-09-24');
    expect(status.dates).toEqual(['2026-09-24', '2024-09-24']);
    expect(status.dateUpdates).toEqual({
      '2026-09-24': '2026-09-27T14:25:00.000Z',
      '2024-09-24': '2026-09-26T10:00:00.000Z',
    });
    expect(status.dateUpdates['2025-01-01']).toBeUndefined();
    expect(db.query).toHaveBeenCalledTimes(2);
  });

  it('returns no date timestamp before the first completed publication', async () => {
    const db = {
      query: jest.fn().mockResolvedValue([]),
      manager: { findOne: jest.fn().mockResolvedValue(null) },
    };
    const status = await new MarketService(
      db as unknown as DataSource,
      {} as TushareService,
    ).status();
    expect(status.latestDate).toBeNull();
    expect(status.dateUpdates).toEqual({});
  });
});
