import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { StockQueryDto } from '@/modules/source/stock/stock.dto';
import { StockEntity } from '@/modules/source/stock/stock.entity';
import { StockHistoryEntity } from '@/modules/source/stock/stock-history.entity';
import { BseMappingEntity } from '@/modules/analysis/market/market.entity';
import { SectorService } from '@/modules/analysis/market/sector.service';

@Injectable()
export class StockService {
  constructor(
    private db: DataSource,
    private sectors: SectorService,
  ) {}

  async stock(dto: StockQueryDto) {
    const [current, history, mappings] = await Promise.all([
      this.db.manager.find(StockEntity),
      this.db.manager.findOneBy(StockHistoryEntity, {
        snapshotKey: 'identity',
      }),
      this.db.manager.find(BseMappingEntity),
    ]);
    const canonical = (code: string) =>
      mappings.find((m) => m.oldCode === code)?.newCode || code;
    const all = new Map(current.map((row) => [canonical(row.tsCode), row]));
    history?.data.stocks.forEach((row) => {
      if (!all.has(canonical(row.tsCode)))
        all.set(canonical(row.tsCode), {
          ...row.profile,
          name: row.name,
          listDate: row.listDate,
          delistDate: row.delistDate,
          tsCode: canonical(row.tsCode),
          symbol: canonical(row.tsCode).split('.')[0],
          listStatus: row.listStatus || (row.delistDate ? 'D' : 'P'),
        } as StockEntity);
    });
    const sectorCodes = dto.sector
      ? await this.sectors.codes(dto.sector, dto.date)
      : null;
    const historicMatches = new Set(
      (history?.data.names || [])
        .filter((n) => dto.name && n.name.includes(dto.name))
        .map((n) => canonical(n.tsCode)),
    );
    const items = [...all.values()]
      .filter(
        (row) =>
          (!dto.tsCode ||
            [
              row.tsCode,
              ...mappings
                .filter((m) => m.newCode === row.tsCode)
                .map((m) => m.oldCode),
            ].some((code) => code.includes(dto.tsCode || ''))) &&
          (!dto.name ||
            row.name.includes(dto.name) ||
            historicMatches.has(row.tsCode)) &&
          (!dto.listStatus || row.listStatus === dto.listStatus) &&
          (!dto.market || row.market === dto.market) &&
          (!dto.isHs || row.isHs === dto.isHs) &&
          (!sectorCodes || sectorCodes.has(row.tsCode)),
      )
      .sort((a, b) => a.tsCode.localeCompare(b.tsCode));
    const page = dto.pageNum || 1;
    const size = dto.pageSize || 20;
    const selected = items.slice((page - 1) * size, page * size);
    return {
      items: await this.sectors.decorate(selected, dto.date),
      meta: {
        totalItems: items.length,
        itemCount: selected.length,
        itemsPerPage: size,
        totalPages: Math.ceil(items.length / size),
        currentPage: page,
      },
      profileAsOf: history?.asOf || null,
      profileBasis: '公司资料为最近快照，行业题材按所选日期的可用快照展示',
    };
  }
}
