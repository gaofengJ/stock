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
  Res,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { AuthRequest, AuthService, COOKIE } from './auth.service';
import {
  LoginDto,
  PasswordDto,
  ProfileDto,
  RegisterDto,
  ResetDto,
  RoleDto,
  UserQueryDto,
  UserUpdateDto,
  ReadActivityDto,
} from './auth.dto';
import { Permit, PERMISSIONS, Public, SignedIn } from './permissions';

const strict = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});
@Controller('auth')
@UsePipes(strict)
export class AuthController {
  constructor(private auth: AuthService) {}

  // Authorize articles and search indexes using the existing role/trial policy.
  @Permit('blog:read')
  @Get('blog-access')
  blogAccess() {
    return { allowed: true };
  }

  @Public()
  @Get('csrf')
  csrf(
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.auth.csrf(req, reply);
  }

  @Public()
  @Post('register')
  register(
    @Body() dto: RegisterDto,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.auth.register(dto, null, req, reply);
  }

  @Public()
  @Get('access')
  access(
    @Req() req: AuthRequest,
    @Query('startTrial') startTrial: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.auth.access(req, reply, startTrial === '1');
  }

  @Public()
  @Post('login')
  login(
    @Body() dto: LoginDto,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.auth.login(dto, req, reply);
  }

  @SignedIn(true)
  @Get('me')
  me(@Req() req: AuthRequest) {
    return req.authUser;
  }

  @SignedIn(true)
  @Post('logout')
  logout(
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.auth.logout(req, reply);
  }

  @SignedIn(true)
  @Patch('password')
  async password(
    @Req() req: AuthRequest,
    @Body() dto: PasswordDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    await this.auth.changePassword(
      req.authUser!,
      dto.currentPassword,
      dto.newPassword,
    );
    reply.clearCookie(COOKIE, this.auth.cookieOptions());
  }
}
@Controller('users')
@UsePipes(strict)
export class ProfileController {
  constructor(private auth: AuthService) {}

  @SignedIn()
  @Patch('me')
  profile(@Req() req: AuthRequest, @Body() dto: ProfileDto) {
    return this.auth.profile(req.authUser!, dto);
  }
}
@Controller('admin')
@UsePipes(strict)
export class AccountsController {
  constructor(private auth: AuthService) {}

  @Permit('users:manage')
  @Get('login-activity')
  activity(@Req() req: AuthRequest) {
    return this.auth.loginActivity(req.authUser!);
  }

  @Permit('users:manage')
  @Post('login-activity/read')
  readActivity(@Req() req: AuthRequest, @Body() dto: ReadActivityDto) {
    return this.auth.readLoginActivity(req.authUser!, dto.throughId);
  }

  @Permit('users:manage')
  @Get('users')
  users(@Query() q: UserQueryDto) {
    return this.auth.users(q);
  }

  @Permit('users:manage')
  @Post('users')
  create(@Req() req: AuthRequest, @Body() dto: RegisterDto) {
    return this.auth.register(dto, req.authUser!);
  }

  @Permit('users:manage')
  @Patch('users/:id')
  update(
    @Req() req: AuthRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UserUpdateDto,
  ) {
    return this.auth.updateUser(req.authUser!, id, dto);
  }

  @Permit('users:manage')
  @Post('users/:id/reset-password')
  reset(
    @Req() req: AuthRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResetDto,
  ) {
    return this.auth.resetPassword(req.authUser!, id, dto.password);
  }

  @Permit('roles:manage', 'users:manage')
  @Get('roles')
  roles() {
    return this.auth.roles();
  }

  @Permit('roles:manage')
  @Get('permissions')
  permissions() {
    return PERMISSIONS;
  }

  @Permit('roles:manage')
  @Post('roles')
  createRole(@Req() req: AuthRequest, @Body() dto: RoleDto) {
    return this.auth.saveRole(req.authUser!, null, dto);
  }

  @Permit('roles:manage')
  @Patch('roles/:id')
  role(
    @Req() req: AuthRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RoleDto,
  ) {
    return this.auth.saveRole(req.authUser!, id, dto);
  }

  @Permit('roles:manage')
  @Delete('roles/:id')
  remove(@Req() req: AuthRequest, @Param('id', ParseIntPipe) id: number) {
    return this.auth.deleteRole(req.authUser!, id);
  }
}
