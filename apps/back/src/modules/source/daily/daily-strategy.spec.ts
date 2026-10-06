import { Repository } from 'typeorm';
import { DailyEntity } from './daily.entity';
import { DailyService } from './daily.service';

function sampleDays(): DailyEntity[] {
  const prices = [
    ['9.50', '9.80', '10.00', '9.40', '9.40'],
    ['10.20', '10.40', '11.00', '10.10', '9.80'],
    ['11.20', '11.60', '12.00', '11.10', '10.40'],
    ['11.40', '11.80', '12.00', '11.30', '11.60'],
  ];
  return prices.map(([open, close, high, low, preClose], index) =>
    Object.assign(new DailyEntity(), {
      tsCode: '000001.SZ',
      tradeDate: `2026-09-${21 + index}`,
      name: '普通股票',
      open,
      close,
      high,
      low,
      preClose,
      // 故意缩量、换手低于基准日，确保未引入无关策略专属限制。
      vol: String(1000 - index * 100),
      amount: '60000',
      turnoverRateF: index === 0 ? '8' : '6',
      volumeRatio: '3',
      upLimit: '20',
    }),
  );
}

describe('连续三日收阳，不限制量比', () => {
  function setup() {
    const rows = sampleDays().slice(0, 3);
    const service = new DailyService(undefined!, {
      find: jest.fn().mockResolvedValue(rows),
    } as unknown as Repository<DailyEntity>);
    const dates = rows.map((row) => row.tradeDate).reverse();
    return { rows, run: () => service.findThreeDaysHighVol(dates) };
  }

  it.each([0, 1, 2])(
    '索引%s日低量比、零值或缺失量比不影响入选',
    async (index) => {
      const { rows, run } = setup();
      rows[index].volumeRatio = '0.1';
      expect(await run()).toHaveLength(1);
      rows[index].volumeRatio = '0';
      expect(await run()).toHaveLength(1);
      rows[index].volumeRatio = undefined;
      expect(await run()).toHaveLength(1);
    },
  );

  it('允许缩量、收盘逐日下降，不要求跳空，但末日必须收在上半区', async () => {
    const { rows, run } = setup();
    rows.forEach((row, index) => {
      Object.assign(row, {
        open: ['10.50', '10.20', '10.10'][index],
        close: ['10.80', '10.60', '10.40'][index],
        preClose: ['10.00', '10.80', '10.60'][index],
        high: '11.00',
        low: '10.00',
        volumeRatio: ['3.0', '2.0', '1.6'][index],
      });
    });
    expect(await run()).toEqual([]);
    rows[2].high = '10.80'; // 中点10.40，恰好收在中点应通过。
    expect(await run()).toHaveLength(1);
  });

  it.each([0, 1, 2])('索引%s日允许普通涨停，仍要求阳线', async (index) => {
    const { rows, run } = setup();
    rows[index].high = rows[index].close;
    rows[index].upLimit = rows[index].close;
    expect(await run()).toHaveLength(1);
    rows[index].open = rows[index].close;
    expect(await run()).toEqual([]);
  });
});

describe('向上跳空上影反包的组合规则', () => {
  function setup() {
    const rows = sampleDays().slice(0, 3);
    const service = new DailyService(undefined!, {
      find: jest.fn().mockResolvedValue(rows),
    } as unknown as Repository<DailyEntity>);
    const dates = rows.map((row) => row.tradeDate).reverse();
    return { rows, run: () => service.findShadowWrap(dates) };
  }

  it('允许反包日缩量，返回D3行情', async () => {
    const { rows, run } = setup();
    rows[2].vol = '100';
    expect(await run()).toEqual([rows[2]]);
  });

  it.each([
    ['10.40', 0],
    ['10.41', 1],
  ])('通过真实筛选入口验证3%%浮点回归，D2最高%s', async (high, expected) => {
    const { rows, run } = setup();
    Object.assign(rows[0], {
      open: '9.80',
      close: '10.00',
      high: '10.00',
      low: '9.70',
    });
    Object.assign(rows[1], {
      open: '10.02',
      close: '10.10',
      high,
      low: '10.01',
      preClose: '10.00',
    });
    Object.assign(rows[2], {
      open: '10.45',
      close: '10.60',
      high: '10.70',
      low: '10.40',
      preClose: '10.10',
    });
    expect(await run()).toHaveLength(expected);
  });

  it.each([
    ['10.00', 0],
    ['9.99', 0],
    ['10.05', 1],
  ])('D3最低价%s按缺口下沿判断', async (low, expected) => {
    const { rows, run } = setup();
    rows[2].low = low;
    expect(await run()).toHaveLength(expected);
  });

  it.each(['11.60', '11.70'])(
    'D3开盘%s不收阳时，即使收盘突破前高也排除',
    async (open) => {
      const { rows, run } = setup();
      rows[2].open = open;
      expect(await run()).toEqual([]);
    },
  );

  it.each([
    ['11.55', 1],
    ['11.54', 0],
  ])('D3收盘%s按当天振幅中点判断', async (close, expected) => {
    const { rows, run } = setup();
    rows[2].close = close;
    expect(await run()).toHaveLength(expected);
  });

  it('允许D3普通收盘涨停，排除D3一字涨停', async () => {
    const { rows, run } = setup();
    const price = rows[2].close;
    Object.assign(rows[2], { high: price, upLimit: price });
    expect(await run()).toHaveLength(1);
    Object.assign(rows[2], { open: price, low: price });
    expect(await run()).toEqual([]);
  });

  it('D2一字涨停不能构成长上影', async () => {
    const { rows, run } = setup();
    const price = rows[1].close;
    Object.assign(rows[1], {
      open: price,
      high: price,
      low: price,
      upLimit: price,
    });
    expect(await run()).toEqual([]);
  });

  it('D2仍允许阴线', async () => {
    const { rows, run } = setup();
    rows[1].open = '10.60';
    expect(await run()).toHaveLength(1);
  });

  it('保留3%幅度定义，上影短于实体也可入选', async () => {
    const { rows, run } = setup();
    Object.assign(rows[1], { open: '10.10', close: '10.80', high: '11.15' });
    rows[2].preClose = '10.80';
    expect(await run()).toHaveLength(1);
  });

  it.each([
    ['26.74', 0],
    ['26.75', 0],
    ['26.76', 1],
  ])('保留上影幅度严格大于3%的门槛，最高价%s', async (high, expected) => {
    const { rows, run } = setup();
    Object.assign(rows[0], {
      open: '24.50',
      close: '25.00',
      high: '25.00',
      low: '24.00',
      preClose: '24.50',
    });
    Object.assign(rows[1], {
      open: '25.50',
      close: '26.00',
      high,
      low: '25.25',
      preClose: '25.00',
    });
    Object.assign(rows[2], {
      open: '27.00',
      close: '28.00',
      high: '28.50',
      low: '26.90',
      preClose: '26.00',
    });
    expect(await run()).toHaveLength(expected);
  });

  it('收盘仅触及D2最高价仍不算反包', async () => {
    const { rows, run } = setup();
    Object.assign(rows[2], {
      open: '10.80',
      close: '11.00',
      high: '11.10',
      low: '10.70',
    });
    expect(await run()).toEqual([]);
  });

  it('D2最低价触及D1最高价仍不算跳空', async () => {
    const { rows, run } = setup();
    rows[1].low = rows[0].high;
    expect(await run()).toEqual([]);
  });
});

const strategies = [
  ['findGapThreeUp', 4],
  ['findGapTwoUp', 3],
  ['findGapThreeHighTurnover', 4],
  ['findThreeDaysHighVol', 3],
  ['findContinuousGap', 3],
  ['findShadowWrap', 3],
] as const;

function highTurnoverDays(): DailyEntity[] {
  const rows = sampleDays();
  rows.forEach((row, index) => {
    // 三天成交额和换手率递减，验证只与D1比较、不要求逐日增加。
    Object.assign(row, {
      amount: ['45000', '60000', '55000', '51000'][index],
      turnoverRateF: ['5.5', '8', '7', '6'][index],
    });
  });
  return rows;
}

describe.each(strategies)('%s通用校验接入', (method, count) => {
  function setup() {
    const rows = (
      method === 'findGapThreeHighTurnover' ? highTurnoverDays() : sampleDays()
    ).slice(0, count);
    // 模拟数据库仅返回select指定列，防止漏查vol导致所有候选被过滤。
    const find = jest.fn(
      async ({ select }: { select: (keyof DailyEntity)[] }) =>
        rows.map((row) =>
          Object.fromEntries(select.map((key) => [key, row[key]])),
        ),
    );
    const service = new DailyService(undefined!, {
      find,
    } as unknown as Repository<DailyEntity>);
    const dates = rows.map((row) => row.tradeDate).reverse();
    return {
      rows,
      find,
      run: (minimum = 5) => service[method](dates, undefined, minimum),
    };
  }

  it('保留满足当前策略的候选，只查一次数据库并读取成交量', async () => {
    const { rows, find, run } = setup();
    const result = await run();
    expect(result).toHaveLength(1);
    expect(result[0].tradeDate).toBe(rows[count - 1].tradeDate);
    expect(find).toHaveBeenCalledTimes(1);
    expect(find.mock.calls[0][0].select).toContain('vol');
  });

  it('形态期每天成交额均严格大于5000万元，基准日不受该门槛限制', async () => {
    const start = method === 'findThreeDaysHighVol' ? 0 : 1;
    for (let index = start; index < count; index += 1) {
      const { rows, run } = setup();
      rows[index].amount = '50000';
      // eslint-disable-next-line no-await-in-loop
      expect(await run()).toEqual([]);
      rows[index].amount = '49999.99';
      // eslint-disable-next-line no-await-in-loop
      expect(await run()).toEqual([]);
      rows[index].amount = '50000.01';
      // eslint-disable-next-line no-await-in-loop
      expect(await run()).toHaveLength(1);
    }
    if (start === 1) {
      const { rows, run } = setup();
      rows[0].amount = '100';
      expect(await run()).toHaveLength(1);
    }
  });

  it('每个形态日自由流通换手率必须严格大于5%，参照日不参与', async () => {
    const start = method === 'findThreeDaysHighVol' ? 0 : 1;
    for (let index = start; index < count; index += 1) {
      const { rows, run } = setup();
      // eslint-disable-next-line no-restricted-syntax -- Verify sequential mutations of the same fixture.
      for (const rate of ['5', '4.99', '0']) {
        rows[index].turnoverRateF = rate;
        // eslint-disable-next-line no-await-in-loop
        expect(await run()).toEqual([]);
      }
      rows[index].turnoverRateF = '5.01';
      // eslint-disable-next-line no-await-in-loop
      expect(await run()).toHaveLength(1);
    }
    if (start === 1) {
      const { rows, run } = setup();
      rows[0].turnoverRateF = undefined;
      expect(await run()).toHaveLength(1);
    }
  });

  it('缺失或非数字换手率不会误入候选', async () => {
    const { rows, run } = setup();
    rows[1].turnoverRateF = undefined;
    if (method === 'findGapThreeHighTurnover') {
      await expect(run()).rejects.toThrow('换手率数据不完整');
    } else {
      expect(await run()).toEqual([]);
      rows[1].turnoverRateF = 'invalid';
      expect(await run()).toEqual([]);
    }
  });
  it('用户换手率门槛参与每个形态日判定，而非仅过滤最后一天', async () => {
    const { rows, run } = setup();
    const start = method === 'findThreeDaysHighVol' ? 0 : 1;
    rows.slice(start).forEach((row) => {
      Object.assign(row, { turnoverRateF: '10.01' });
    });
    rows[start].turnoverRateF = '10';
    expect(await run(10)).toEqual([]);
    expect(await run(9.99)).toHaveLength(1);
    rows[start].turnoverRateF = '3';
    expect(await run(2)).toHaveLength(1);
    expect(await run()).toEqual([]);
  });

  it('形态期任一天一字涨停都不能入选', async () => {
    const start = method === 'findThreeDaysHighVol' ? 0 : 1;
    for (let index = start; index < count; index += 1) {
      const { rows, run } = setup();
      const price = rows[index].close;
      Object.assign(rows[index], {
        open: price,
        high: price,
        low: price,
        upLimit: price,
      });
      // eslint-disable-next-line no-await-in-loop
      expect(await run()).toEqual([]);
    }
  });

  it('末日收盘在中点可入选，低一分排除', async () => {
    const { rows, run } = setup();
    const last = rows[count - 1];
    const price = Number(last.close);
    last.high = (price + 0.03).toFixed(2);
    last.low = (price - 0.03).toFixed(2);
    last.open = (price - 0.02).toFixed(2);
    expect(await run()).toHaveLength(1);
    last.close = (price - 0.01).toFixed(2);
    expect(await run()).toEqual([]);
  });

  it('仍允许实际成交量逐日下降', async () => {
    const { rows, run } = setup();
    expect(Number(rows[count - 1].vol)).toBeLessThan(
      Number(rows[count - 2].vol),
    );
    expect(await run()).toHaveLength(1);
  });

  it('允许末日普通收盘涨停', async () => {
    const { rows, run } = setup();
    const last = rows[count - 1];
    last.high = last.close;
    last.upLimit = last.close;
    expect(await run()).toHaveLength(1);
  });

  if (method === 'findContinuousGap') {
    it('末日收在上半区的阴线仍可入选', async () => {
      const { rows, run } = setup();
      rows[count - 1].open = '11.70';
      expect(await run()).toHaveLength(1);
    });
  }

  it.each([
    ['name', '*ST股票'],
    ['vol', '0'],
    ['amount', '0'],
    ['preClose', '8.00'],
  ])('排除后续交易日的异常%s', async (field, value) => {
    const { rows, run } = setup();
    Object.assign(rows[count - 1], { [field]: value });
    expect(await run()).toEqual([]);
  });

  it('缺少观察窗口内的一天时不入选', async () => {
    const { rows, run } = setup();
    rows.splice(1, 1);
    expect(await run()).toEqual([]);
  });
});

describe('跳空后三连阳的组合规则', () => {
  function setup() {
    const rows = sampleDays();
    const service = new DailyService(undefined!, {
      find: jest.fn().mockResolvedValue(rows),
    } as unknown as Repository<DailyEntity>);
    const dates = rows.map((row) => row.tradeDate).reverse();
    return { rows, run: () => service.findGapThreeUp(dates) };
  }

  it.each([1, 2, 3])('允许第%s天普通收盘涨停', async (index) => {
    const { rows, run } = setup();
    rows[index].high = rows[index].close;
    rows[index].upLimit = rows[index].close;
    expect(await run()).toHaveLength(1);
  });

  it.each([1, 2, 3])('排除第%s天一字涨停', async (index) => {
    const { rows, run } = setup();
    const price = rows[index].close;
    Object.assign(rows[index], {
      open: price,
      high: price,
      low: price,
      upLimit: price,
    });
    expect(await run()).toEqual([]);
  });

  it.each([
    [2, '10.00'],
    [2, '9.99'],
    [3, '10.00'],
    [3, '9.99'],
  ])('排除第%s天下探到%s的缺口回补', async (index, low) => {
    const { rows, run } = setup();
    rows[index].low = low;
    expect(await run()).toEqual([]);
  });

  it('允许部分进入缺口但最低价仍高于D1最高价', async () => {
    const { rows, run } = setup();
    rows[2].low = '10.05';
    rows[3].low = '10.01';
    expect(await run()).toHaveLength(1);
  });

  it.each([
    ['11.65', 1],
    ['11.64', 0],
  ])('D4收盘%s按当天振幅中点判断', async (close, expected) => {
    const { rows, run } = setup();
    // D4最高12、最低11.3，中点为11.65。
    rows[3].close = close;
    expect(await run()).toHaveLength(expected);
  });

  it('三天阳线收盘逐日下降也允许入选', async () => {
    const { rows, run } = setup();
    Object.assign(rows[1], {
      open: '10.50',
      close: '11.00',
      high: '11.20',
    });
    Object.assign(rows[2], {
      open: '10.40',
      close: '10.80',
      high: '11.00',
      low: '10.20',
      preClose: '11.00',
    });
    Object.assign(rows[3], {
      open: '10.30',
      close: '10.60',
      high: '10.80',
      low: '10.10',
      preClose: '10.80',
    });
    expect(await run()).toHaveLength(1);
  });

  it.each([1, 2, 3])('第%s天非阳线仍然排除', async (index) => {
    const { rows, run } = setup();
    rows[index].open = rows[index].close;
    expect(await run()).toEqual([]);
  });

  it('D2最低价等于D1最高价时仍不算向上跳空', async () => {
    const { rows, run } = setup();
    rows[1].low = rows[0].high;
    expect(await run()).toEqual([]);
  });

  it('普通涨停可以入选，高换手无需高于基准日', async () => {
    const rows = sampleDays();
    rows[1].high = rows[1].close;
    rows[1].upLimit = rows[1].close;
    const service = new DailyService(undefined!, {
      find: jest.fn().mockResolvedValue(rows),
    } as unknown as Repository<DailyEntity>);
    const dates = rows.map((row) => row.tradeDate);
    expect(
      await service.findGapTwoUp(dates.slice(0, 3).reverse()),
    ).toHaveLength(1);
    expect(await service.findGapThreeUp([...dates].reverse())).toHaveLength(1);
    rows[0].amount = '45000';
    expect(
      await service.findGapThreeHighTurnover([...dates].reverse()),
    ).toHaveLength(1);
  });
});

describe('跳空后三日高换手的组合规则', () => {
  function setup() {
    const rows = highTurnoverDays();
    const service = new DailyService(undefined!, {
      find: jest.fn().mockResolvedValue(rows),
    } as unknown as Repository<DailyEntity>);
    const dates = rows.map((row) => row.tradeDate).reverse();
    return { rows, run: () => service.findGapThreeHighTurnover(dates) };
  }

  it('换手率和成交额逐日下降仍可入选', async () => {
    expect(await setup().run()).toHaveLength(1);
  });

  it.each([1, 2, 3])('检查索引%s日成交额的5000万元严格边界', async (index) => {
    const { rows, run } = setup();
    rows[index].amount = '50000';
    expect(await run()).toEqual([]);
    rows[index].amount = '49999.99';
    expect(await run()).toEqual([]);
    rows[index].amount = '50000.01';
    expect(await run()).toHaveLength(1);
  });

  it.each([1, 2, 3])('索引%s日换手需严格高于5%%，不比较D1', async (index) => {
    const { rows, run } = setup();
    rows[0].turnoverRateF = '4';
    rows[index].turnoverRateF = '5';
    expect(await run()).toEqual([]);
    rows[index].turnoverRateF = '5.01';
    expect(await run()).toHaveLength(1);
    rows[0].turnoverRateF = '5.5';
    rows[index].turnoverRateF = '5.5';
    expect(await run()).toHaveLength(1);
    rows[index].turnoverRateF = '5.49';
    expect(await run()).toHaveLength(1);
    rows[index].turnoverRateF = '5.51';
    expect(await run()).toHaveLength(1);
  });

  it('缺失换手率明确报错；真实零值正常排除；基准日换手率不参与', async () => {
    const { rows, run } = setup();
    rows[0].turnoverRateF = undefined;
    expect(await run()).toHaveLength(1);
    rows[2].turnoverRateF = undefined;
    await expect(run()).rejects.toThrow('换手率数据不完整');
    rows[2].turnoverRateF = '0';
    expect(await run()).toEqual([]);
  });

  it('仅D2成交额须严格高于D1，D3、D4可以低于D1', async () => {
    const { rows, run } = setup();
    rows[0].amount = '60000';
    expect(await run()).toEqual([]);
    rows[0].amount = '60000.01';
    expect(await run()).toEqual([]);
    rows[0].amount = '59999.99';
    expect(await run()).toHaveLength(1);
  });

  it.each([2, 3])('索引%s日必须保持缺口', async (index) => {
    const { rows, run } = setup();
    rows[index].low = '10.00';
    expect(await run()).toEqual([]);
    rows[index].low = '9.99';
    expect(await run()).toEqual([]);
    rows[index].low = '10.01';
    expect(await run()).toHaveLength(1);
  });

  it.each([1, 2, 3])('索引%s日允许普通涨停但排除一字涨停', async (index) => {
    const { rows, run } = setup();
    const price = rows[index].close;
    Object.assign(rows[index], { high: price, upLimit: price });
    expect(await run()).toHaveLength(1);
    Object.assign(rows[index], { open: price, low: price });
    expect(await run()).toEqual([]);
  });

  it('允许收盘逐日下降及D4收阴，但末日必须收在上半区', async () => {
    const { rows, run } = setup();
    Object.assign(rows[1], { open: '10.60', close: '10.40' });
    Object.assign(rows[2], {
      open: '10.70',
      close: '10.30',
      high: '11.00',
      low: '10.10',
      preClose: '10.40',
    });
    Object.assign(rows[3], {
      open: '10.30',
      close: '10.20',
      high: '11.00',
      low: '10.10',
      preClose: '10.30',
    });
    expect(await run()).toEqual([]);
    rows[3].high = '10.30'; // 中点10.20，仍为阴线。
    expect(await run()).toHaveLength(1);
  });

  it('D2最低价触及D1最高价仍不算跳空', async () => {
    const { rows, run } = setup();
    rows[1].low = rows[0].high;
    expect(await run()).toEqual([]);
  });
});

describe('跳空后二连阳的组合规则', () => {
  function setup() {
    const rows = sampleDays().slice(0, 3);
    const service = new DailyService(undefined!, {
      find: jest.fn().mockResolvedValue(rows),
    } as unknown as Repository<DailyEntity>);
    const dates = rows.map((row) => row.tradeDate).reverse();
    return { rows, run: () => service.findGapTwoUp(dates) };
  }

  it.each(['10.00', '9.99'])(
    'D3最低价%s触及或跌破D1最高价时排除',
    async (low) => {
      const { rows, run } = setup();
      rows[2].low = low;
      expect(await run()).toEqual([]);
    },
  );

  it('允许部分进入缺口但仍高于D1最高价', async () => {
    const { rows, run } = setup();
    rows[2].low = '10.05';
    expect(await run()).toHaveLength(1);
  });

  it.each([
    ['11.55', 1],
    ['11.54', 0],
  ])('D3收盘%s按当天振幅中点判断', async (close, expected) => {
    const { rows, run } = setup();
    // D3最高12、最低11.1，中点为11.55。
    rows[2].close = close;
    expect(await run()).toHaveLength(expected);
  });

  it.each(['11.00', '10.80'])(
    'D3收盘%s等于或低于D2收盘仍允许入选',
    async (close) => {
      const { rows, run } = setup();
      Object.assign(rows[1], { open: '10.50', close: '11.00', high: '11.20' });
      Object.assign(rows[2], {
        open: '10.40',
        close,
        high: '11.00',
        low: '10.20',
        preClose: '11.00',
      });
      expect(await run()).toHaveLength(1);
    },
  );

  it.each([1, 2])('允许索引%s日的普通收盘涨停', async (index) => {
    const { rows, run } = setup();
    rows[index].high = rows[index].close;
    rows[index].upLimit = rows[index].close;
    expect(await run()).toHaveLength(1);
  });

  it.each([1, 2])('排除索引%s日的一字涨停', async (index) => {
    const { rows, run } = setup();
    const price = rows[index].close;
    Object.assign(rows[index], {
      open: price,
      high: price,
      low: price,
      upLimit: price,
    });
    expect(await run()).toEqual([]);
  });

  it.each([1, 2])('索引%s日非阳线仍排除', async (index) => {
    const { rows, run } = setup();
    rows[index].open = rows[index].close;
    expect(await run()).toEqual([]);
  });

  it('D2最低价等于D1最高价仍不算跳空', async () => {
    const { rows, run } = setup();
    rows[1].low = rows[0].high;
    expect(await run()).toEqual([]);
  });
});
