import {
  comparableTitle,
  matchingStocks,
  newsGroup,
  similarNews,
  RuleCandidate,
} from './news.rules';

describe('Conservative news rules', () => {
  const title = '平安银行：前三季度净利润同比增长10%，营业收入稳步增长';
  it('merges punctuation and source labels while preserving changed financial figures', () => {
    expect(comparableTitle('【财联社】中国银行公布业绩。')).toBe(
      '中国银行公布业绩',
    );
    expect(similarNews(title, `【快讯】${title.replace('：', '，')}`)).toBe(
      true,
    );
    expect(similarNews(title, title.replace('10%', '12%'))).toBe(false);
    expect(similarNews(title, title.replace('增长10%', '下降10%'))).toBe(false);
    expect(similarNews('股票上涨', '股票上涨')).toBe(false);
    expect(
      similarNews(
        '平安银行提高存款利率，业务稳步增长',
        '平安银行降低存款利率，业务稳步增长',
      ),
    ).toBe(false);
  });
  it('limits groups to different sources, the same kind and three hours', () => {
    const item: RuleCandidate = {
      id: 2,
      title,
      source: 'jin10',
      kind: 'flash',
      published_at: '2026-10-01T08:00:00Z',
      group_key: '',
    };
    const other = { ...item, id: 1, source: 'cls', group_key: 'existing' };
    expect(newsGroup(item, [other])).toBe('existing');
    expect(newsGroup(item, [{ ...other, source: 'jin10' }])).not.toBe(
      'existing',
    );
    expect(newsGroup(item, [{ ...other, kind: 'article' }])).not.toBe(
      'existing',
    );
    expect(
      newsGroup(item, [{ ...other, published_at: '2026-10-01T04:59:00Z' }]),
    ).not.toBe('existing');
  });
  it('compares the substantive bracket headline without appending Sina body figures', () => {
    const headline = '电科思仪：拟每10股派发现金红利2.5元';
    expect(
      similarNews(
        `【${headline}】公司2026年10月23日公布分红方案，股权登记日为10月30日。`,
        headline,
      ),
    ).toBe(true);
    expect(
      similarNews(
        `【${headline}】公司公布方案`,
        headline.replace('2.5', '2.8'),
      ),
    ).toBe(false);
    expect(
      similarNews(
        '【快讯】公司宣布暂停交易，等待公告',
        '公司宣布恢复交易，等待公告',
      ),
    ).toBe(false);
  });
  it('links exact company names and codes without matching longer numeric identifiers', () => {
    const stocks = [
      {
        tsCode: '000001.SZ',
        name: '平安银行',
        fullname: '平安银行股份有限公司',
      },
      { tsCode: '600000.SH', name: '浦发银行' },
    ];
    expect(
      matchingStocks('平安银行公布业绩', stocks).map((s) => s.tsCode),
    ).toEqual(['000001.SZ']);
    expect(
      matchingStocks('关注 000001.sz', stocks).map((s) => s.tsCode),
    ).toEqual(['000001.SZ']);
    expect(matchingStocks('订单号 10000012，与股价无关', stocks)).toEqual([]);
    expect(matchingStocks('成交额600000元，价格600000.01', stocks)).toEqual([]);
  });
});
