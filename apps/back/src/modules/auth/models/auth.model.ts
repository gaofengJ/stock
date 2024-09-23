import { ApiProperty } from '@nestjs/swagger';

export class LoginTokenModel {
  @ApiProperty({ description: 'JWT身份Token' })
  token: string;
}
