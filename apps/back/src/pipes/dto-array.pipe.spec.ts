import { StockDto } from '@/modules/source/stock/stock.dto';
import { DtoArrayPipe } from './dto-array.pipe';

describe('bulk record validation', () => {
  const pipe = new DtoArrayPipe(StockDto, 2);
  const metadata = { type: 'body' as const, metatype: Array };
  const stock = {
    tsCode: '000001.SZ',
    symbol: '000001',
    name: '样本',
    area: '',
    industry: '',
    cnspell: '',
    market: '主板',
    listDate: '2020-01-01',
  };

  it('retains valid bulk and empty no-op requests', async () => {
    await expect(pipe.transform([stock], metadata)).resolves.toEqual([stock]);
    await expect(pipe.transform([], metadata)).resolves.toEqual([]);
  });

  it('checks every item and forbids unrecognized fields', async () => {
    await expect(
      pipe.transform([stock, { ...stock, listDate: 'invalid' }], metadata),
    ).rejects.toThrow();
    await expect(
      pipe.transform([{ ...stock, unexpected: true }], metadata),
    ).rejects.toThrow();
    await expect(pipe.transform([null], metadata)).rejects.toThrow();
  });

  it('rejects nonarrays and oversized batches before item validation', async () => {
    await expect(pipe.transform(stock, metadata)).rejects.toMatchObject({
      status: 422,
    });
    await expect(
      pipe.transform([stock, stock, stock], metadata),
    ).rejects.toMatchObject({ status: 422 });
  });
});
