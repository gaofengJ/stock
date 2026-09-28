import {
  hasValidStrategySequence,
  isOnePriceLimitUp,
  isCloseInUpperHalf,
  hasUpperShadowAboveThreePercent,
} from './strategy-validation';

const day = () => ({
  name: '普通股票',
  open: '10.00',
  close: '10.50',
  high: '10.60',
  low: '9.90',
  preClose: '10.50',
  vol: '1000',
  amount: '10000',
});

describe('价格边界使用整数分计算', () => {
  it.each([
    ['10.03', true],
    ['10.02', false],
    ['10.04', true],
  ])('最高10.06、最低10，收盘%s精确判断中点', (close, expected) => {
    expect(isCloseInUpperHalf({ high: '10.06', low: '10.00', close })).toBe(
      expected,
    );
  });

  it('中点有半分时不向下取整', () => {
    expect(
      isCloseInUpperHalf({ high: '10.05', low: '10.00', close: '10.02' }),
    ).toBe(false);
    expect(
      isCloseInUpperHalf({ high: '10.05', low: '10.00', close: '10.03' }),
    ).toBe(true);
  });

  it('支持数值输入和DECIMAL(16,2)大数，不丢失分精度', () => {
    expect(isCloseInUpperHalf({ high: 10.06, low: 10, close: 10.03 })).toBe(
      true,
    );
    expect(
      isCloseInUpperHalf({
        high: '99999999999999.99',
        low: '99999999999999.93',
        close: '99999999999999.95',
      }),
    ).toBe(false);
  });

  it.each([
    ['10.39', false],
    ['10.40', false],
    ['10.41', true],
  ])('昨收10、实体上沿10.10、最高%s，严格排除等于3%%', (high, expected) => {
    expect(
      hasUpperShadowAboveThreePercent({
        open: '10.05',
        close: '10.10',
        high,
        preClose: '10.00',
      }),
    ).toBe(expected);
    expect(
      hasUpperShadowAboveThreePercent({
        open: '10.10',
        close: '10.05',
        high,
        preClose: '10.00',
      }),
    ).toBe(expected);
  });

  it.each([null, undefined, 'NaN', 'Infinity', '-1', '10.001'])(
    '无效或超出日线价格精度的%s不参与边界判断',
    (value) => {
      expect(
        isCloseInUpperHalf({ high: value, low: '10.00', close: '10.03' }),
      ).toBe(false);
      expect(
        hasUpperShadowAboveThreePercent({
          open: '10.00',
          close: '10.10',
          high: '10.50',
          preClose: value,
        }),
      ).toBe(false);
    },
  );
});

describe('一字涨停判断', () => {
  const limitDay = {
    open: '11.00',
    close: '11.00',
    high: '11.00',
    low: '11.00',
    upLimit: '11.00',
  };

  it('识别四价相等且达到涨停价', () => {
    expect(isOnePriceLimitUp(limitDay)).toBe(true);
  });

  it.each(['open', 'close', 'high', 'low'])(
    '%s不等于涨停价时不视为一字涨停',
    (field) => {
      expect(isOnePriceLimitUp({ ...limitDay, [field]: '10.90' })).toBe(false);
    },
  );

  it.each([undefined, null, '0', 'NaN', 'Infinity', '12.00'])(
    '涨停价为%s时不误判一字涨停',
    (upLimit) => {
      expect(isOnePriceLimitUp({ ...limitDay, upLimit })).toBe(false);
    },
  );
});

describe('策略通用日线校验', () => {
  it('接受数值相等但小数位不同的价格，不要求收盘上涨', () => {
    expect(
      hasValidStrategySequence([
        day(),
        { ...day(), preClose: 10.5, close: '10.20' },
      ]),
    ).toBe(true);
  });

  it.each(['ST股票', '*ST股票', ' n新股 ', 'c新股', '股票退', '  '])(
    '排除观察窗口中任一天的特殊或空名称：%s',
    (name) => {
      [0, 1, 2, 3].forEach((index) => {
        const days = [day(), day(), day(), day()];
        days[index].name = name;
        expect(hasValidStrategySequence(days)).toBe(false);
      });
    },
  );

  it('只按前缀识别N/C，接受名称中间的字母', () => {
    expect(hasValidStrategySequence([{ ...day(), name: ' 普通NC股票 ' }])).toBe(
      true,
    );
  });

  it.each(['open', 'close', 'high', 'low', 'preClose', 'vol', 'amount'])(
    '排除无效或非正的%s',
    (field) => {
      [
        null,
        undefined,
        '',
        ' ',
        0,
        -1,
        'NaN',
        NaN,
        Infinity,
        'Infinity',
      ].forEach((value) => {
        expect(
          hasValidStrategySequence([day(), { ...day(), [field]: value }]),
        ).toBe(false);
      });
    },
  );

  it('排除任意相邻交易日价格基准不一致', () => {
    [1, 2, 3].forEach((index) => {
      const days = [day(), day(), day(), day()];
      days[index].preClose = '10.49';
      expect(hasValidStrategySequence(days)).toBe(false);
    });
  });

  it('排除空序列和缺失交易日', () => {
    expect(hasValidStrategySequence([])).toBe(false);
    expect(hasValidStrategySequence([undefined, day()])).toBe(false);
    expect(hasValidStrategySequence([day(), null])).toBe(false);
  });
});
