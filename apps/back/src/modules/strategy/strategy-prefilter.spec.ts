import { StrategyService } from './strategy.service';
import { TREND_DEFAULTS } from './trend-rules';

describe('standard signal prefilter', () => {
  const query = {
    ...TREND_DEFAULTS,
    date: '2026-09-30',
    strategyType: 'fiveMaUp',
    includeLabels: false,
  } as any;
  function setup() {
    const trends: any = {
      list: jest.fn().mockResolvedValue([{ tsCode: '000001.SZ' }]),
    };
    const insights: any = {
      standardCandidates: jest.fn().mockResolvedValue(['000001.SZ']),
    };
    const service = new StrategyService(
      null as any,
      null as any,
      undefined,
      trends,
      undefined,
      undefined,
      insights,
    );
    return { service, trends, insights };
  }
  it('keeps the trend evaluator authoritative and rechecks publication after calculating', async () => {
    const { service, trends, insights } = setup();
    const rows = await service.list(query);
    expect(rows).toEqual([
      { tsCode: '000001.SZ', industry: '', industries: [], topics: [] },
    ]);
    expect(trends.list).toHaveBeenCalledTimes(1);
    expect(trends.list.mock.calls[0][3]).toEqual(['000001.SZ']);
    expect(insights.standardCandidates).toHaveBeenCalledTimes(2);
  });
  it('recomputes the full universe when the snapshot becomes invalid during the request', async () => {
    const { service, trends, insights } = setup();
    insights.standardCandidates
      .mockResolvedValueOnce(['000001.SZ'])
      .mockResolvedValueOnce(undefined);
    trends.list
      .mockResolvedValueOnce([{ tsCode: '000001.SZ' }])
      .mockResolvedValueOnce([{ tsCode: '000002.SZ' }]);
    expect(await service.list(query)).toEqual([
      { tsCode: '000002.SZ', industry: '', industries: [], topics: [] },
    ]);
    expect(trends.list.mock.calls[1]).toHaveLength(3);
  });
  it('falls back to the full universe when standard signals are unavailable', async () => {
    const { service, trends, insights } = setup();
    insights.standardCandidates.mockResolvedValue(undefined);
    await service.list(query);
    expect(trends.list.mock.calls[0][3]).toBeUndefined();
    expect(insights.standardCandidates).toHaveBeenCalledTimes(1);
  });
});
