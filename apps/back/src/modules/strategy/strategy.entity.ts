import { ApiProperty } from '@nestjs/swagger';

/**
 * 单个 tab
 */
export class TabItem {
  @ApiProperty()
  label: string;

  @ApiProperty()
  key: string;
}
