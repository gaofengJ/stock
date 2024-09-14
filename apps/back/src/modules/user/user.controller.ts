import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiResult } from '@/decorators/api-result.decorator';

import { Pagination } from '@/helper/paginate/pagination';
import { IdParam } from '@/decorators/id-param.decorator';

import { UserService } from './user.service';
import { UserEntity } from './entities/user.entity';
import { UserDto, UserQueryDto, UserUpdateDto } from './user.dto';

@ApiTags('用户信息')
@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('/list')
  @ApiOperation({ summary: '获取User列表' })
  @ApiResult({ type: [UserEntity], isPage: true })
  async list(@Query() dto: UserQueryDto): Promise<Pagination<UserEntity>> {
    return this.userService.list(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取User详情' })
  @ApiResult({ type: UserEntity })
  async info(@IdParam() id: number): Promise<UserEntity> {
    return this.userService.detail(id);
  }

  @Post('/create')
  @ApiOperation({ summary: '创建User' })
  async create(@Body() dto: UserDto) {
    await this.userService.create(dto);
  }

  @Post('/bulk-create')
  @ApiOperation({ summary: '批量创建User' })
  async bulkCreate(@Body() dto: UserDto[]) {
    await this.userService.bulkCreate(dto);
  }

  @Put(':id')
  @ApiOperation({ summary: '更新User' })
  async update(@IdParam() id: number, @Body() dto: UserUpdateDto) {
    await this.userService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除User' })
  async delete(@IdParam() id: number) {
    await this.userService.delete(id);
  }

  @Delete('/clear')
  @ApiOperation({ summary: '清空User' })
  async clear() {
    await this.userService.clear();
  }
}
