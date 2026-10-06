import { Controller, ForbiddenException, Get, Req } from '@nestjs/common';
import { AuthRequest } from '../../auth/auth.service';
import { SignedIn } from '../../auth/permissions';
import { readPlaybook } from './playbook.content';

@Controller('admin/playbook')
export class PlaybookController {
  @Get()
  @SignedIn()
  read(@Req() req: AuthRequest) {
    // Delegated management permissions do not grant access to this private guide.
    if (!req.authUser?.roles.some((role) => role.code === 'admin')) {
      throw new ForbiddenException('仅管理员可查看交易与学习体系');
    }
    return readPlaybook();
  }
}
