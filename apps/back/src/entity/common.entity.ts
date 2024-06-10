import { ApiHideProperty } from '@nestjs/swagger'; // 导入 NestJS Swagger 装饰器，用于在 Swagger 文档中隐藏或显示属性
import { Exclude } from 'class-transformer'; // 导入 class-transformer 的 Exclude 装饰器，用于在序列化过程中排除属性
import {
  BaseEntity,
  Column,
  CreateDateColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * @description 定义一个抽象类 CommonEntity， 继承自 TypeORM 的 BaseEntity，作为所有实体的基类
 */
export abstract class CommonEntity extends BaseEntity {
  // 定义主键列，生成自增id
  @PrimaryGeneratedColumn()
  id: number;

  // 定义创建日期列，在实体插入时自动设置值
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  // 定义更新日期列，在实体插入时自动设置值
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

/**
 * @description 定义另一个抽象类 CompleteEntity，继承自 CommonEntity，增加更多通用字段
 */
export abstract class CompleteEntity extends CommonEntity {
  // 定义一个名为 create_by的列，表示创建者，字段不可更新，可以为空
  // 使用 ApiHideProperty 和 Exclude 装饰器在 Swagger 文档和序列化过程中隐藏该属性
  @ApiHideProperty()
  @Exclude()
  @Column({
    name: 'create_by',
    update: false,
    comment: '创建者',
    nullable: true,
  })
  createBy: number;

  // 定义一个名为 'update_by' 的列，表示更新者，可以为空
  // 使用 ApiHideProperty 和 Exclude 装饰器在 Swagger 文档和序列化过程中隐藏该属性
  @ApiHideProperty()
  @Exclude()
  @Column({
    name: 'update_by',
    comment: '更新者',
    nullable: true,
  })
  updateBy: number;
}
