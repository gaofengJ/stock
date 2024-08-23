import { ApiProperty } from '@nestjs/swagger';

export class BasicActiveFundsEntity {
  @ApiProperty({
    description: '游资名称',
  })
  name: string;

  @ApiProperty({
    description: '关联机构',
  })
  orgs: string[];

  @ApiProperty({
    description: '说明',
  })
  desc: string;
}
