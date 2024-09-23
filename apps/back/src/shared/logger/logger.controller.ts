import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import * as dayjs from 'dayjs';

import { ApiResult } from '@/decorators/api-result.decorator';

import { loggerQueryDto } from './logger.dto';
import { LoggerResEntity } from './logger.entity';
import { LoggerService } from './logger.service';

@ApiTags('日志模块')
// @UseGuards(ResourceGuard)
@Controller('logs')
export class LoggerController {
  constructor(private readonly loggerService: LoggerService) {}

  @Get('/list')
  @ApiOperation({ summary: '获取日志列表' })
  @ApiResult({ type: LoggerResEntity, isPage: false })
  // @Perm(permissions.LIST)
  async list(@Query() dto: loggerQueryDto) {
    const { startDate, endDate, loggerType } = dto;
    const formatedStartDate = dayjs(startDate).format('YYYY-MM-DD');
    const formatedEndDate = dayjs(endDate).format('YYYY-MM-DD');
    const list = this.loggerService.list({
      startDate: formatedStartDate,
      endDate: formatedEndDate,
      loggerType,
    });
    return {
      list,
    };
  }
}
