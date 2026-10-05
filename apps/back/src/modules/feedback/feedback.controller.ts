import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { SignedIn } from '../auth/permissions';
import { AuthRequest } from '../auth/auth.service';
import { FeedbackMessageDto, FeedbackPageDto } from './feedback.dto';
import { FeedbackService } from './feedback.service';

@Controller('feedback')
@SignedIn()
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class FeedbackController {
  constructor(private feedback: FeedbackService) {}

  @Get()
  list(@Req() req: AuthRequest, @Query() query: FeedbackPageDto) {
    return this.feedback.list(req.authUser!, query.page);
  }

  @Post()
  create(@Req() req: AuthRequest, @Body() dto: FeedbackMessageDto) {
    return this.feedback.create(req.authUser!, dto.content);
  }

  @Get(':id')
  detail(@Req() req: AuthRequest, @Param('id', ParseIntPipe) id: number) {
    return this.feedback.detail(id, req.authUser!);
  }

  @Post(':id/replies')
  reply(
    @Req() req: AuthRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: FeedbackMessageDto,
  ) {
    return this.feedback.reply(id, req.authUser!, dto.content);
  }
}
