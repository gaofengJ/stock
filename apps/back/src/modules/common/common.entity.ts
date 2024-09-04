import { ApiProperty } from '@nestjs/swagger';

/**
 * 单个选项
 */
export class Option {
  /**
   * 选项的显示标签
   */
  @ApiProperty({ description: '选项的显示标签' })
  label: string;

  /**
   * 选项的值
   */
  @ApiProperty({ description: '选项的值' })
  value: string | number;
}

/**
 * 所有选项
 */
export class AllOption {
  @ApiProperty()
  key: Option[];
}
