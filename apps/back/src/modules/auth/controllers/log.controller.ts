import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiResult } from '@/decorators/api-result.decorator';
// import { Perm } from '../decorators/permission.decorator';
import { Pagination } from '@/helper/paginate/pagination';

import { LoginLogQueryDto } from '../dto/log.dto';
import { LoginLogModel } from '../models/log.model';
import { LoginLogService } from '../services/login-log.service';

@ApiTags('User - 日志模块')
@Controller('log')
export class LogController {
  constructor(private loginLogService: LoginLogService) {}

  @Get('login/list')
  @ApiOperation({ summary: '查询登录日志列表' })
  @ApiResult({ type: [LoginLogModel], isPage: true })
  async loginLogPage(
    @Query() dto: LoginLogQueryDto,
  ): Promise<Pagination<LoginLogModel>> {
    return this.loginLogService.list(dto);
  }
}
