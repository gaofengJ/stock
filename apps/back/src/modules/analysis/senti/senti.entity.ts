import { ApiProperty } from '@nestjs/swagger';

/**
 * 涨跌分布统计 Entity
 */
export class SentiDistributionTatisticsEntity {
  @ApiProperty({
    description: '交易日期',
  })
  tradeDate: string;

  @ApiProperty({
    description: '计数',
  })
  count: number;
}

/**
 * 连日涨跌统计 Entity
 */
export class SentiUpDownCountEntity {
  @ApiProperty({
    description: '交易日期',
  })
  tradeDate: string;

  @ApiProperty({
    description: '上涨家数',
  })
  upCount: number;

  @ApiProperty({
    description: '平盘家数',
  })
  flatCount: number;

  @ApiProperty({
    description: '下跌家数',
  })
  downCount: number;
}

/**
 * 连日涨跌统计 Entity
 */
export class SentiLimitUpDownCountEntity {
  @ApiProperty({
    description: '交易日期',
  })
  tradeDate: string;

  @ApiProperty({
    description: '涨停家数',
  })
  limitUCount: number;

  @ApiProperty({
    description: '跌停家数',
  })
  limitDCount: number;

  @ApiProperty({
    description: '炸板家数',
  })
  limitZCount: number;
}
