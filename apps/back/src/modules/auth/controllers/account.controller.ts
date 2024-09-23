import { Body, Controller, Get, Ip, Headers } from '@nestjs/common';
import { ApiExtraModels, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiResult } from '@/decorators/api-result.decorator';
import { ApiSecurityAuth } from '@/decorators/swagger.decorator';
import { UserModel } from '@/modules/user/user.model';
import { UserService } from '@/modules/user/user.service';

import { CurrentUser } from '../decorators/current-user.decorator';
import { SkipAuthGuard } from '../decorators/skip-auth-guard.decorator';
import { LoginDto } from '../dto/auth.dto';
import { LoginTokenModel } from '../models/auth.model';
import { AuthService } from '../services/auth.service';
import { CaptchaService } from '../services/captcha.service';

@ApiTags('账户信息')
@ApiSecurityAuth()
@ApiExtraModels(UserModel)
// @UseGuards(JwtAuthGuard)
@Controller('account')
export class AccountController {
  constructor(
    private readonly userService: UserService,
    private readonly authService: AuthService,
    private captchaService: CaptchaService,
  ) {}

  @Get('/profile')
  @ApiOperation({ summary: '账户基础信息' })
  @ApiResult({ type: UserModel })
  @SkipAuthGuard()
  async profile(@CurrentUser() user: IUser) {
    return this.userService.detail(user.id);
  }

  @Get('/login')
  @ApiOperation({ summary: '登录' })
  @ApiResult({ type: LoginTokenModel })
  async login(
    @Body() dto: LoginDto,
    @Ip() ip: string,
    @Headers('user-agent') ua: string,
  ) {
    await this.captchaService.checkImgCaptcha(dto.captchaId, dto.verifyCode);
    const token = await this.authService.login(
      dto.username,
      dto.password,
      ip,
      ua,
    );
    return { token };
  }
}
