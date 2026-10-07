import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  Post,
  Query,
  Req,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
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
    return this.service.read(this.owner(req), dto.date, dto.revision);
  }

  @Post()
  @Header('Cache-Control', 'no-store')
  save(@Req() req: AuthRequest, @Body() dto: NotebookSaveDto) {
    return this.service.save(this.owner(req), dto);
  }

  @Post('publications')
  @Header('Cache-Control', 'no-store')
  record(@Req() req: AuthRequest, @Body() dto: NotebookPublishDto) {
    return this.service.recordPublication(this.owner(req), dto);
  }
}
