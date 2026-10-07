import axios from 'axios';
import { publicThsReview, thsReviewRows } from './public-ths-review';
import groups from '../../analysis/market/ths-review-groups.fixture';

const stock = {
  ths_code: '600001.SH',
  stock_name: '甲',
  concept: '医药',
  abnormal_reason: '行业事件摘要',
  detail_reason: '公司原因：\n1、公司披露业务进展。',
};
const payload = (rows = [stock], date = '20260930') => ({
  status_code: 0,
  data: { tab_list: [{ date, tab_name: '医药', tab_data: rows }] },
});

afterEach(() => jest.restoreAllMocks());

it('preserves all 52 stocks and 12 official groups from the 2026-09-30 reference', () => {
  const data = {
    status_code: 0,
    data: {
      tab_list: Object.entries(groups).map(([theme, codes]) => ({
        date: '20260930',
        tab_name: theme,
        tab_data: codes.map((code) => ({
          ...stock,
          ths_code: code,
          concept: theme,
        })),
      })),
    },
  };
  const rows = thsReviewRows(data, '20260930');
  expect(rows).toHaveLength(52);
  expect(new Set(rows.map((row) => row.ts_code)).size).toBe(52);
  expect(new Set(rows.map((row) => row.theme)).size).toBe(12);
  expect(rows.find((row) => row.ts_code === '002242.SZ')?.theme).toBe(
    '地产产业链',
  );
  expect(rows.find((row) => row.ts_code === '001266.SZ')?.theme).toBe(
    '电力/风电',
  );
  expect(rows.find((row) => row.ts_code === '603739.SH')?.theme).toBe('医药');
  expect(rows[0].detail_reason).toBe(stock.detail_reason);
});

it('rejects wrong dates, duplicate stocks, category conflicts, missing fields and source errors', () => {
  expect(
    thsReviewRows(
      payload([{ ...stock, abnormal_reason: null! }]),
      '20260930',
    )[0].lu_desc,
  ).toBe('');
  expect(() => thsReviewRows(payload([], '20260929'), '20260930')).toThrow();
  expect(() => thsReviewRows(payload([stock, stock]), '20260930')).toThrow();
  expect(() =>
    thsReviewRows(payload([{ ...stock, concept: '机器人' }]), '20260930'),
  ).toThrow();
  expect(() =>
    thsReviewRows(
      payload([{ ...stock, detail_reason: undefined! }]),
      '20260930',
    ),
  ).toThrow();
  expect(() => thsReviewRows({ status_code: 1 }, '20260930')).toThrow();
  expect(
    thsReviewRows({ status_code: 0, data: { tab_list: [] } }, '20260930'),
  ).toEqual([]);
});

it('requests only publicly listed dates, without attempting gated history or other providers', async () => {
  const get = jest
    .spyOn(axios, 'get')
    .mockResolvedValueOnce({
      data: { status_code: 0, data: { date_list: [{ date: '20260930' }] } },
    })
    .mockResolvedValueOnce({ data: payload() });
  const result = await publicThsReview({ trade_date: '20260930' });
  expect(get).toHaveBeenCalledTimes(2);
  expect(result.data.items).toHaveLength(1);
  expect(result.data.fields).toContain('detail_reason');
  get.mockClear().mockResolvedValue({
    data: { status_code: 0, data: { date_list: [{ date: '20260930' }] } },
  });
  await expect(publicThsReview({ trade_date: '20260101' })).rejects.toThrow(
    '历史访问权限',
  );
  expect(get).toHaveBeenCalledTimes(1);
  expect(get.mock.calls[0][0]).toContain('list_recent_date');
});
