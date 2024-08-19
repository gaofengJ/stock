import { ApiProperty } from '@nestjs/swagger';

export class ChainsCountLimitUpTimesEntity {
  @ApiProperty({
    description: '交易日期',
  })
  tradeDate: string;

  @ApiProperty({
    description: '计数',
  })
  count: number;
}

export class ChainsUpgradeLimitUpRatesEntity {
  @ApiProperty({
    description: '交易日期',
  })
  tradeDate: string;

  @ApiProperty({
    description: '百分比',
  })
  rate: number;
}

export class ChainsLimitUpAmountEntity {
  @ApiProperty({
    description: '交易日期',
  })
  tradeDate: string;

  @ApiProperty({
    description: '金额合计(元)',
  })
  totalAmount: number;
}
