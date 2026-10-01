// eslint-disable-next-line import/no-extraneous-dependencies -- HTTP integration uses Nest's test harness.
import { Test } from '@nestjs/testing';
import { RouterModule } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ACCESS } from '@/modules/auth/permissions';
import {
  IntradayCountsModule,
  IntradayCountsController,
} from './intraday-counts.module';
import { IntradayCountsService } from './intraday-counts.service';

describe('盘中涨跌家数路由、参数校验和权限声明', () => {
  let app: NestFastifyApplication;
  const series = jest
    .fn()
    .mockResolvedValue({ points: [], dates: [], retentionDays: 30 });
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        IntradayCountsModule,
        RouterModule.register([
          { path: 'analysis', module: IntradayCountsModule },
        ]),
      ],
    })
      .overrideProvider(IntradayCountsService)
      .useValue({ series })
      .compile();
    app = module.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app.setGlobalPrefix('api');
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  afterAll(() => app?.close());

  it('复用市场情绪权限', () => {
    expect(
      Reflect.getMetadata(ACCESS, IntradayCountsController.prototype.series),
    ).toEqual({
      any: ['analysis:senti'],
    });
  });
  it('正确路由返回空历史并应用默认10个交易日', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/analysis/market/intraday-counts',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().points).toEqual([]);
    expect(series).toHaveBeenLastCalledWith(
      expect.objectContaining({ days: 10 }),
    );
  });
  it.each(['days=60', 'days=0', 'date=2026-02-30', 'scope=hs'])(
    '拒绝超出保留期、无效日期和伪造的分市场查询 %s',
    async (query) => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/analysis/market/intraday-counts?${query}`,
      });
      expect(response.statusCode).toBe(400);
    },
  );
});
