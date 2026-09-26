import { Global, Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import {
  AccountsController,
  AuthController,
  ProfileController,
} from './auth.controller';

@Global()
@Module({
  providers: [AuthService],
  controllers: [AuthController, ProfileController, AccountsController],
  exports: [AuthService],
})
export class AuthModule {}
