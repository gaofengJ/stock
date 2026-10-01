import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Permit } from '../auth/permissions';
import { AuthRequest } from '../auth/auth.service';
import { NewsQuery, NewsSourceUpdate } from './news.dto';
import { NewsService } from './news.service';

@Controller('news')
export class NewsController {
  constructor(private readonly news: NewsService) {}

  @Get()
  @Permit('news:read')
  list(@Query() query: NewsQuery, @Req() req: AuthRequest) {
    return this.news.list(query, req.authUser?.id);
  }

  @Get('sources')
  @Permit('news:read')
  sources(@Req() req: AuthRequest) {
    return this.news.sources(
      Boolean(req.authUser?.permissions.includes('news:manage')),
    );
  }

  @Patch('sources/:code')
  @Permit('news:manage')
  update(@Param('code') code: string, @Body() dto: NewsSourceUpdate) {
    return this.news.updateSource(code, dto);
  }

  @Post('sync')
  @Permit('news:manage')
  sync() {
    return this.news.requestSync();
  }

  @Get(':id')
  @Permit('news:read')
  detail(@Param('id', ParseIntPipe) id: number, @Req() req: AuthRequest) {
    return this.news.detail(id, req.authUser?.id);
  }

  @Post(':id/favorite')
  @Permit('news:read')
  favorite(@Param('id', ParseIntPipe) id: number, @Req() req: AuthRequest) {
    return this.news.favorite(id, req.authUser?.id, true);
  }

  @Delete(':id/favorite')
  @Permit('news:read')
  unfavorite(@Param('id', ParseIntPipe) id: number, @Req() req: AuthRequest) {
    return this.news.favorite(id, req.authUser?.id, false);
  }
}
