import { Injectable } from '@nestjs/common';
import {
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  registerDecorator,
} from 'class-validator';
import { DataSource, ObjectType, Repository } from 'typeorm';
import { DataSourceService } from '../database.service';

/**
 * 查询某个字段的值是否在数据表中存在
 */
@ValidatorConstraint({ name: 'entityItemExist', async: true })
@Injectable()
export class EntityExistConstraint implements ValidatorConstraintInterface {
  constructor(private dataSource: DataSource) {}

  /**
   * 验证给定的值是否在指定实体的数据库记录中存在
   * @param value 被验证的值
   * @param args 验证参数，包含约束条件和目标对象等信息
   * @returns Promise<boolean> 如果值存在于数据库中，返回 true，否则返回 false
   */
  async validate(value: string, args: ValidationArguments) {
    let repo: Repository<any>;

    if (!value) return true;
    // 默认对比字段是id
    let field = 'id';
    const dataSource = DataSourceService.getDataSource();
    // 通过传入的 entity 获取其 repository
    if ('entity' in args.constraints[0]) {
      // 传入的是对象 可以指定对比字段
      field = args.constraints[0].field ?? 'id';
      repo = dataSource.getRepository(args.constraints[0].entity);
    } else {
      // 传入的是实体类
      repo = dataSource.getRepository(args.constraints[0]);
    }
    // 通过查询记录是否存在进行验证
    const item = await repo.findOne({ where: { [field]: value } });
    return !!item;
  }

  /**
   * 返回验证失败时的默认错误信息
   * @param args 验证参数，包含约束条件和目标对象等信息
   * @returns 验证失败时的错误消息字符串
   */
  defaultMessage(args: ValidationArguments) {
    if (!args.constraints[0]) return 'Model not been specified!'; // 未指定模型
    return `All instance of ${args.constraints[0].name} must been exists in databse!`;
  }
}

/**
 * 数据存在性验证装饰器工厂函数
 * @param entity entity 实体类，默认对比字段为 'id'
 * @param validationOptions 可选的验证选项
 */
function IsEntityExist(
  entity: ObjectType<any>,
  validationOptions?: ValidationOptions,
): (object: Record<string, any>, propertyName: string) => void;

/**
 * 数据存在性验证装饰器工厂函数的重载
 * @param condition condition 验证条件对象，可指定对比字段
 * @param validationOptions 可选的验证选项
 */
function IsEntityExist(
  condition: { entity: ObjectType<any>; field?: string },
  validationOptions?: ValidationOptions,
): (object: Record<string, any>, propertyName: string) => void;

/**
 * 数据存在性验证装饰器工厂函数的实现
 * @param condition 实体类或验证条件对象。如果传入的是实体类，则默认对比字段为 'id'；如果传入的是对象，则可指定对比字段
 * @param validationOptions 可选的验证选项
 * @returns 一个装饰器函数，接受两个参数：对象和属性名
 */
function IsEntityExist(
  condition: ObjectType<any> | { entity: ObjectType<any>; field?: string },
  validationOptions?: ValidationOptions,
): (object: Record<string, any>, propertyName: string) => void {
  return (object: Record<string, any>, propertyName: string) => {
    // 注册自定义验证器
    registerDecorator({
      target: object.constructor, // 目标类的构造函数
      propertyName, // 属性名称
      options: validationOptions, // 验证选项
      constraints: [condition], // 约束条件数组
      validator: EntityExistConstraint, // 自定义验证器
    });
  };
}

export { IsEntityExist };
