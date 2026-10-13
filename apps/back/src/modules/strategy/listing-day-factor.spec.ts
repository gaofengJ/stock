import { listingDayFactor } from './listing-day-factor';

describe('listing-day HFQ recovery', () => {
  const date = '2026-10-13';
  const quote = {
    tsCode: '301660.SZ',
    open: '45',
    close: '38.8',
    high: '45',
    low: '38',
  };
  const response = {
    code: 0,
    data: {
      fields: ['ts_code', 'trade_date', 'adj_factor'],
      items: [['301660.SZ', '20261013', 1]],
    },
  };
  it('uses verified day-one unit factor and real prices', () => {
    expect(listingDayFactor(date, date, quote as any, response)).toEqual([
      '301660.SZ',
      45,
      38.8,
      45,
      38,
    ]);
  });
  it('does not extrapolate to later dates or assume a factor', () => {
    expect(
      listingDayFactor(date, '2026-10-12', quote as any, response),
    ).toBeUndefined();
    [null, 0, 2, '', undefined].forEach((factor) => {
      expect(
        listingDayFactor(date, date, quote as any, {
          code: 0,
          data: {
            ...response.data,
            items: [['301660.SZ', '20261013', factor]],
          },
        }),
      ).toBeUndefined();
    });
  });
  it('rejects missing, duplicate, wrong-date and wrong-code evidence', () => {
    [
      [],
      [...response.data.items, ...response.data.items],
      [['301660.SZ', '20261012', 1]],
      [['000001.SZ', '20261013', 1]],
    ].forEach((items) => {
      expect(
        listingDayFactor(date, date, quote as any, {
          code: 0,
          data: { ...response.data, items },
        }),
      ).toBeUndefined();
    });
    expect(
      listingDayFactor(date, date, quote as any, { ...response, code: -1 }),
    ).toBeUndefined();
  });
  it('rejects invalid or inconsistent raw prices', () => {
    [{ open: '0' }, { close: 'NaN' }, { high: '37' }, { low: '46' }].forEach(
      (change) => {
        expect(
          listingDayFactor(
            date,
            date,
            { ...quote, ...change } as any,
            response,
          ),
        ).toBeUndefined();
      },
    );
  });
});
