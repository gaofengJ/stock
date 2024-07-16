import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity } from 'typeorm';
import { CommonEntity } from '@/entity/common.entity';

// 使用 @Entity 装饰器将这个类标记为一个实体，并指定数据库表名为 't_source_stock'
@Entity({
  name: 't_source_stock',
  comment: '股票基本信息表',
})
// 定义一个名为 StockEntity 的类，并继承 CommonEntity
export class StockEntity extends CommonEntity {
  @Column({
    name: 'ts_code',
    type: 'varchar',
    length: 16,
    nullable: false,
    comment: '股票代码（包含交易所）',
  })
  @ApiProperty({ description: '股票代码（包含交易所）' })
  tsCode: string;

  @Column({
    name: 'symbol',
    type: 'varchar',
    length: 16,
    nullable: false,
    comment: '股票代码',
  })
  @ApiProperty({ description: '股票代码' })
  symbol: string;

  @Column({
    name: 'name',
    type: 'varchar',
    length: 16,
    nullable: false,
    comment: '股票名称',
  })
  @ApiProperty({ description: '股票名称' })
  name: string;

  @Column({
    name: 'area',
    type: 'varchar',
    length: 16,
    nullable: false,
    comment: '所在区域',
  })
  @ApiProperty({ description: '所在区域' })
  area: string;

  @Column({
    name: 'industry',
    type: 'varchar',
    length: 16,
    nullable: false,
    comment: '所在行业',
  })
  @ApiProperty({ description: '所在行业' })
  industry: string;

  @Column({
    name: 'fullname',
    type: 'varchar',
    length: 256,
    nullable: true,
    comment: '股票全称',
  })
  @ApiProperty({ description: '股票全称' })
  fullname?: string;

  @Column({
    name: 'enname',
    type: 'varchar',
    length: 256,
    nullable: true,
    comment: '英文全称',
  })
  @ApiProperty({ description: '英文全称' })
  enname?: string;

  @Column({
    name: 'cnspell',
    type: 'varchar',
    length: 16,
    nullable: false,
    comment: '拼音缩写',
  })
  @ApiProperty({ description: '拼音缩写' })
  cnspell: string;

  @Column({
    name: 'market',
    type: 'varchar',
    length: 16,
    nullable: false,
    comment: '市场类型（主板/中小板/创业板/科创板/北交所）',
  })
  @ApiProperty({ description: '市场类型（主板/中小板/创业板/科创板/北交所）' })
  market: string;

  @Column({
    name: 'exchange',
    type: 'varchar',
    length: 16,
    nullable: true,
    comment: '交易所代码',
  })
  @ApiProperty({ description: '交易所代码' })
  exchange?: string;

  @Column({
    name: 'curr_type',
    type: 'varchar',
    length: 16,
    nullable: true,
    comment: '交易货币',
  })
  @ApiProperty({ description: '交易货币' })
  currType?: string;

  @Column({
    name: 'list_status',
    type: 'varchar',
    length: 16,
    nullable: true,
    comment: '上市状态（L上市 D退市 P暂停上市）',
  })
  @ApiProperty({ description: '上市状态（L上市 D退市 P暂停上市）' })
  listStatus?: string;

  @Column({
    name: 'list_date',
    type: 'date',
    nullable: false,
    comment: '上市日期',
  })
  @ApiProperty({ description: '上市日期' })
  listDate: string;

  @Column({
    name: 'delist_date',
    type: 'date',
    nullable: true,
    comment: '退市日期',
  })
  @ApiProperty({ description: '退市日期' })
  delistDate?: string;

  @Column({
    name: 'is_hs',
    type: 'varchar',
    length: 16,
    nullable: true,
    comment: '是否沪深港通标的，N否 H沪股通 S深股通',
  })
  @ApiProperty({ description: '是否沪深港通标的，N否 H沪股通 S深股通' })
  isHs?: string;

  @Column({
    name: 'act_name',
    type: 'varchar',
    length: 16,
    nullable: true,
    comment: '实控人名称',
  })
  @ApiProperty({ description: '实控人名称' })
  actName?: string;

  @Column({
    name: 'act_ent_type',
    type: 'varchar',
    length: 16,
    nullable: true,
    comment: '实控人企业性质',
  })
  @ApiProperty({ description: '实控人企业性质' })
  actEntType?: string;

  /**
   * @OneToMany 表示这是一个一对多的关系，即一个 StockEntity 对象对应多个 DailyEntity 对象
   * () => DailyEntity 指定了关系的目标实体是 DailyEntity
   * (daily) => daily.stockBasic 指定了在 DailyEntity 中用来表示与之关联的 StockEntity 对象的属性。
   * 假设 DailyEntity 中有一个名为 stockBasic 的属性，用来反向映射到 StockEntity 对象
   *
   * dailys 是在 StockEntity 中用来表示与之关联的多个 DailyEntity 对象的属性。
   * Relation<DailyEntity[]> 表示这是一个关系属性，类型为 DailyEntity[]，即 dailys 中存储了多个 DailyEntity 对象的数组
   */
  // @OneToMany(() => DailyEntity, (daily) => daily.stockBasic)
  // dailys: Relation<DailyEntity[]>;
}
