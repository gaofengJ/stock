import { ActiveFundsService } from './active-funds.service';
import { fundOrgs } from './fund-orgs';

it('keeps a directory readable when legacy records contain null, invalid or mixed seat values', async () => {
  const service = new ActiveFundsService({
    list: async () => [
      { name: '甲', orgs: null, desc: null },
      { name: '乙', orgs: 'null', desc: '' },
      { name: '丙', orgs: '格式错误', desc: '简介' },
      {
        name: '丁',
        orgs: JSON.stringify([
          ' ',
          null,
          3,
          '证券（中国）上海营业部',
          '证券(中国) 上海营业部',
          '证券(中国)南京营业部',
        ]),
        desc: '完整简介',
      },
    ],
  } as any);
  const rows = await service.list();
  expect(rows).toHaveLength(4);
  expect(rows[0]).toEqual({ name: '甲', orgs: [], desc: '' });
  expect(rows[1].orgs).toEqual([]);
  expect(rows[2].orgs).toEqual([]);
  expect(rows[3].orgs).toEqual([
    '证券（中国）上海营业部',
    '证券(中国)南京营业部',
  ]);
  expect(fundOrgs('{"org":"证券上海营业部"}')).toEqual([]);
});
