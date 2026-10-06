import { Injectable } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { StockQueryDto } from '@/modules/source/stock/stock.dto';
import { StockEntity } from '@/modules/source/stock/stock.entity';
import {
  readArchivedStocks,
  readHistoricNames,
} from '@/modules/source/stock/stock-list-reader';
import { BseMappingEntity } from '@/modules/analysis/market/market.entity';
import { SectorService } from '@/modules/analysis/market/sector.service';
import { AsyncTtlCache } from '@/modules/analysis/async-ttl-cache';

@Injectable()
export class StockService {
  private readonly directoryCache = new AsyncTtlCache(30000);

  private readonly pageCache = new AsyncTtlCache(10000);

  constructor(
    private db: DataSource,
    private sectors: SectorService,
  ) {}

  async stock(dto: StockQueryDto) {
    return this.pageCache.getOrCreate(JSON.stringify(dto), () =>
      this.readStockPage(dto),
    );
  }

  private async readStockPage(dto: StockQueryDto) {
    const { all, mappings, asOf } = await this.directoryCache.getOrCreate(
      'directory',
      async () => {
        const [current, mapping] = await Promise.all([
          this.db.manager.find(StockEntity, {
            select: {
              tsCode: true,
              name: true,
              listStatus: true,
              market: true,
              isHs: true,
            },
          }),
          this.db.manager.find(BseMappingEntity, {
            select: { oldCode: true, newCode: true },
          }),
        ]);
        const aliases = new Map(mapping.map((m) => [m.oldCode, m.newCode]));
        const canonicalCode = (code: string) => aliases.get(code) || code;
        const stocks = new Map(
          current.map((row) => [canonicalCode(row.tsCode), row]),
        );
        const history = await readArchivedStocks(
          this.db.manager,
          new Set(stocks.keys()),
          canonicalCode,
        );
        history.stocks.forEach((row) => {
          if (!stocks.has(canonicalCode(row.tsCode)))
            stocks.set(canonicalCode(row.tsCode), {
              ...row.profile,
              name: row.name,
              listDate: row.listDate,
              delistDate: row.delistDate,
              tsCode: canonicalCode(row.tsCode),
              symbol: canonicalCode(row.tsCode).split('.')[0],
              listStatus: row.listStatus || (row.delistDate ? 'D' : 'P'),
            } as StockEntity);
        });
        return { all: stocks, mappings: mapping, asOf: history.asOf };
      },
    );
    const canonical = (code: string) =>
      mappings.find((m) => m.oldCode === code)?.newCode || code;
    const sectorCodes = dto.sector
      ? await this.sectors.codes(dto.sector, dto.date)
      : null;
    const historicMatches = new Set(
      (dto.name
        ? await this.directoryCache.getOrCreate('names', () =>
            readHistoricNames(this.db.manager),
          )
        : []
      )
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
    const currentProfiles = selected.length
      ? await this.db.manager.find(StockEntity, {
          where: { tsCode: In(selected.map((row) => row.tsCode)) },
        })
      : [];
    const profiles = new Map(currentProfiles.map((row) => [row.tsCode, row]));
    return {
      items: await this.sectors.decorate(
        selected.map((row) => profiles.get(row.tsCode) || row),
        dto.date,
      ),
      meta: {
        totalItems: items.length,
        itemCount: selected.length,
        itemsPerPage: size,
        totalPages: Math.ceil(items.length / size),
        currentPage: page,
      },
      profileAsOf: asOf,
      profileBasis: '公司资料为最近快照，行业题材按所选日期的可用快照展示',
    };
  }
}
