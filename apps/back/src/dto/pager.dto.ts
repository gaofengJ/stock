import { ApiProperty } from '@nestjs/swagger';
import { Expose, Transform } from 'class-transformer';
import {
  Allow,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

/**
 * @description 排序顺序
 */
export enum Order {
  /**
   * 升序
   */
  ASC = 'ASC',
  /**
   * 降序
   */
  DESC = 'DESC',
}

/**
 * @description 定义泛型类 PagerDto，默认泛型类型为 any，用于分页和排序参数的数据传输对象
 */
export class PagerDto {
  @ApiProperty({ minimum: 1, default: 1 })
  @Min(1)
  @IsInt()
  // 使用 Expose 装饰器，确保该属性在类转换时被暴露
  @Expose()
  @IsOptional({ always: true })
  @Transform(({ value: val }) => (val ? Number.parseInt(val, 10) : 1), {
    toClassOnly: true,
  })
  pageNum: number;

  @ApiProperty({ minimum: 1, maximum: 50, default: 10 })
  @Min(1)
  @Max(50)
  @IsInt()
  @Expose()
  @IsOptional({ always: true })
  @Transform(({ value: val }) => (val ? Number.parseInt(val, 10) : 10), {
    toClassOnly: true,
  })
  pageSize: number;

  @ApiProperty()
  @IsString()
  @IsOptional()
  orderField?: string; // 定义可选的 orderField 属性，表示排序字段

  @ApiProperty({ enum: Order })
  @IsEnum(Order)
  @IsOptional()
  @Transform(({ value }) => (value === 'asc' ? Order.ASC : Order.DESC))
  order?: Order;

  @Allow() // 使用 Allow 装饰器，允许 _t 属性存在而不进行验证
  _t?: number; // 定义可选的 _t 属性，通常用于缓存或临时数据
}
