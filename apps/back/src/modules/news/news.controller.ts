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
import {
  NewsQuery,
  NewsSourceUpdate,
  NewsPreferences,
  NewsStockQuery,
} from './news.dto';
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

  @Get('preferences')
  @Permit('news:read')
  preferences(@Req() req: AuthRequest) {
    return this.news.preferences(req.authUser?.id);
  }

  @Patch('preferences')
  @Permit('news:read')
  savePreferences(@Body() dto: NewsPreferences, @Req() req: AuthRequest) {
    return this.news.savePreferences(dto, req.authUser?.id);
  }

  @Get('stocks')
  @Permit('news:read')
  stockOptions(@Query() query: NewsStockQuery) {
    return this.news.stockOptions(query);
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

  @Post(':id/read')
  @Permit('news:read')
  read(@Param('id', ParseIntPipe) id: number, @Req() req: AuthRequest) {
    return this.news.markRead(id, req.authUser?.id);
  }

  @Delete(':id/favorite')
  @Permit('news:read')
  unfavorite(@Param('id', ParseIntPipe) id: number, @Req() req: AuthRequest) {
    return this.news.favorite(id, req.authUser?.id, false);
  }
}
