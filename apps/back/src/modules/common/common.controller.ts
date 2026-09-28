import { GuestRead } from '@/modules/auth/permissions';
import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiResult } from '@/decorators/api-result.decorator';

import { CommonService } from './common.service';
import { AllOption } from './common.entity';

@ApiTags('公共数据')
@Controller('common')
export class CommonController {
  constructor(private readonly commonService: CommonService) {}

  @GuestRead()
  @Get('/all-options')
  @ApiOperation({ summary: '所有选项' })
  @ApiResult({ type: AllOption })
  allOptions() {
    const ret = this.commonService.allOptions();
    return ret;
  }
}
