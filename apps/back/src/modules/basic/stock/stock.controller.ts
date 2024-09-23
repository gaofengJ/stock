import { Controller, Get, Logger, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiResult } from '@/decorators/api-result.decorator';
import { StockQueryDto } from '@/modules/source/stock/stock.dto';
import { StockEntity } from '@/modules/source/stock/stock.entity';

import { StockService } from './stock.service';

@ApiTags('基础数据')
@Controller('stock')
export class StockController {
  private logger = new Logger(StockController.name);

  constructor(private readonly stockService: StockService) {}

  @Get('/list')
  @ApiOperation({ summary: '股票基础信息' })
  @ApiResult({ type: [StockEntity], isPage: true })
  async list(@Query() dto: StockQueryDto) {
    this.logger.log(
      `Received request list with params: ${JSON.stringify(dto)}`,
    );

    const ret = await this.stockService.stock(dto);
    return ret;
  }
}
