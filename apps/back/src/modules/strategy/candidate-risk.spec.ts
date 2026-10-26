import { BadRequestException } from '@nestjs/common';
import { CandidateRiskService } from './candidate-risk.service';
import {
  announcementRiskTypes,
  candidateRiskEvents,
  summarizeRiskEvents,
} from './candidate-risk-rules';

describe('candidate risk summaries', () => {
  it('separates leads from resolved or denied events', () => {
    expect(announcementRiskTypes('收到中国证监会立案告知书')).toContain(
      '立案处罚线索',
    );
    expect(announcementRiskTypes('关于不存在重大诉讼的澄清公告')).toEqual([
      '诉讼仲裁进展',
    ]);
    expect(announcementRiskTypes('重大资产重组终止公告')).toContain(
      '重组终止线索',
    );
    expect(announcementRiskTypes('解除股份冻结及诉讼结案公告')).toEqual([
      '诉讼仲裁进展',
      '治理风险进展',
    ]);
    expect(announcementRiskTypes('年度股东大会通知')).toEqual([]);
  });

  it('excludes future disclosures and old announcements, never exposes unsafe links', () => {
    const events = candidateRiskEvents(
      [
        {
          ann_date: '20260901',
          title: '重大诉讼公告',
          url: 'data:text/html,unsafe',
        },
        { ann_date: '20261001', title: '立案公告' },
        { ann_date: '20260901', rec_time: '20261001', title: '行政处罚公告' },
        { ann_date: '20250101', title: '立案公告' },
      ],
      [],
      [],
      '2026-09-30',
    );
    expect(events).toHaveLength(1);
    expect(events[0].url).toBeNull();
    expect(summarizeRiskEvents(events)[0]).not.toHaveProperty('title');
  });

  it('deduplicates unlock holder updates and ignores undisclosed unlocks', () => {
    const rows = [
      {
        ts_code: '000001.SZ',
        ann_date: '20260901',
        float_date: '20261010',
        holder_name: 'A',
        float_share: 10000,
      },
      {
        ts_code: '000001.SZ',
        ann_date: '20260902',
        float_date: '20261010',
        holder_name: 'A',
        float_share: 20000,
      },
      {
        ts_code: '000001.SZ',
        ann_date: '20261001',
        float_date: '20261011',
        holder_name: 'B',
        float_share: 30000,
      },
    ];
    const events = candidateRiskEvents([], rows, [], '2026-09-30');
    expect(events).toHaveLength(1);
    expect(events[0].detail).toContain('2.00万股');
  });

  it('uses latest available pledge statistic, labels stale data, never treats missing as zero', () => {
    const run = (rows: any[]) =>
      candidateRiskEvents([], [], rows, '2026-09-30');
    expect(run([{ end_date: '20260925', pledge_ratio: null }])).toEqual([]);
    expect(run([{ end_date: '20261001', pledge_ratio: 90 }])).toEqual([]);
    expect(
      run([
        { end_date: '20260925', pledge_ratio: 20 },
        { end_date: '20260801', pledge_ratio: 70 },
      ]),
    ).toEqual([]);
    expect(run([{ end_date: '20260801', pledge_ratio: 30 }])[0].label).toBe(
      '历史高质押 30.0%',
    );
  });

  it('only reads three bounded cache batches, preserving successes on another source failure', async () => {
    const snapshots = {
      readBatch: jest.fn(
        async (source: string, params: { ts_code: string }[]) =>
          params.map(({ ts_code: code }) => ({
            source,
            state: source === 'pledge_stat' ? 'error' : 'ready',
            rows:
              source === 'eastmoney_ann'
                ? [
                    {
                      ts_code: code,
                      ann_date: '20260901',
                      title: '重大诉讼公告',
                    },
                  ]
                : [],
          })),
      ),
    };
    const service = new CandidateRiskService(snapshots as any, {} as any);
    const response = await service.list('2026-09-30', [
      '000001.SZ',
      '000002.SZ',
    ]);
    expect(snapshots.readBatch).toHaveBeenCalledTimes(3);
    expect(response.items[0].tags[0].label).toBe('诉讼仲裁线索');
    expect(response.items[0]).not.toHaveProperty('events');
    expect(response.items[0].sources.some((s) => s.state === 'error')).toBe(
      true,
    );
    await expect(
      service.list('2026-09-30', Array(21).fill('000001.SZ')),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(snapshots.readBatch).toHaveBeenCalledTimes(3);
  });
});
