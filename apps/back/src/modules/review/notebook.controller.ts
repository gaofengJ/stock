import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  Res,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { Throttle } from '@nestjs/throttler';
import { Bypass } from '@/decorators/bypass.decorator';
import { SignedIn } from '../auth/permissions';
import { AuthRequest } from '../auth/auth.service';
import { NotebookService } from './notebook.service';
import {
  NotebookPublishDto,
  NotebookSaveDto,
  NotebookVersionDto,
} from './notebook.dto';

@Controller('review/notebook')
@SignedIn()
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class NotebookController {
  constructor(private service: NotebookService) {}

  private owner(req: AuthRequest) {
    if (!req.authUser?.roles.some((r) => r.code === 'admin'))
      throw new ForbiddenException('仅管理员可使用私人复盘记录');
    return req.authUser.id;
  }

  @Get('dates')
  @Header('Cache-Control', 'no-store')
  dates(@Req() req: AuthRequest) {
    return this.service.list(this.owner(req));
  }

  @Get()
  @Header('Cache-Control', 'no-store')
  read(@Req() req: AuthRequest, @Query() dto: NotebookVersionDto) {
    return this.service.read(
      this.owner(req),
      dto.date,
      dto.revision,
      dto.publicationBodies !== 0,
      dto.previous !== 0,
      dto.assetReferences === 1,
    );
  }

  @Get('images/:hash')
  @Bypass()
  // A notebook supports twenty images. Keep a bounded image-specific budget.
  @Throttle({ default: { limit: 30, ttl: 10000 } })
  async image(
    @Req() req: AuthRequest,
    @Param('hash') hash: string,
    @Res() reply: FastifyReply,
  ) {
    const image = await this.service.image(this.owner(req), hash);
    const etag = `"${hash}"`;
    // Authenticate and check ownership before accepting a conditional request.
    reply.header('Cache-Control', 'private, max-age=0, must-revalidate');
    reply.header('ETag', etag);
    reply.header('X-Content-Type-Options', 'nosniff');
    if (req.headers['if-none-match'] === etag) return reply.status(304).send();
    return reply.type(image.type).send(image.data);
  }

  @Post()
  @Header('Cache-Control', 'no-store')
  save(@Req() req: AuthRequest, @Body() dto: NotebookSaveDto) {
    return this.service.save(this.owner(req), dto);
  }

  @Get('publications/:id')
  @Header('Cache-Control', 'no-store')
  publication(@Req() req: AuthRequest, @Param('id', ParseIntPipe) id: number) {
    return this.service.publication(this.owner(req), id);
  }

  @Post('publications')
  @Header('Cache-Control', 'no-store')
  record(@Req() req: AuthRequest, @Body() dto: NotebookPublishDto) {
    return this.service.recordPublication(this.owner(req), dto);
  }
}
