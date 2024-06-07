import { Injectable } from '@nestjs/common';
import {
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  registerDecorator,
} from 'class-validator';
import { isNil, merge } from 'lodash';
import { ClsService } from 'nestjs-cls';
import { DataSource, Not, ObjectType } from 'typeorm';

// 定义验证条件接口
interface Condition {
  entity: ObjectType<any>; // 实体类
  field?: string; // 字段名
  message?: string; // 验证失败的错误信息
}

/**
 * 验证某个字段的唯一性
 */
@ValidatorConstraint({ name: 'entityItemUnique', async: true })
@Injectable()
export class UniqueConstraint implements ValidatorConstraintInterface {
  constructor(
    private dataSource: DataSource, // 数据源
    private readonly cls: ClsService, // CLS服务
  ) {}

  /**
   * 验证逻辑
   * @param value 被验证的值
   * @param args 验证参数，包含约束条件和目标对象等信息
   * @returns Promise<boolean> 如果值存在于数据库中，返回 true，否则返回 false
   */
  async validate(value: any, args: ValidationArguments) {
    // 获取要验证的模型和字段
    const config: Omit<Condition, 'entity'> = {
      field: args.property, // 获取要验证的属性名
    };

    // 根据约束条件创建验证条件对象
    const condition = ('entity' in args.constraints[0]
      ? merge(config, args.constraints[0]) // 如果约束条件中包含实体信息，则合并属性配置和实体信息
      : {
          ...config,
          entity: args.constraints[0], // 否则，直接使用约束条件作为实体信息
        }) as unknown as Required<Condition>;

    if (!condition.entity) return false; // 如果未指定实体信息，则验证失败

    // 查询是否存在数据,如果已经存在则验证失败
    try {
      const repo = this.dataSource.getRepository(condition.entity);

      // 如果未指定自定义错误消息，则尝试从字段的注释中生成错误消息
      if (!condition.message) {
        const targetColumn = repo.metadata.columns.find(
          (n) => n.propertyName === condition.field, // 查找与字段名匹配的列元数据
        );
        if (targetColumn?.comment) {
          // 查找与字段名匹配的列元数据
          // eslint-disable-next-line no-param-reassign
          args.constraints[0].message = `已存在相同的${targetColumn.comment}`;
        }
      }

      let andWhere = {}; // 初始化 where 条件
      const operateId = this.cls.get('operateId'); // // 获取操作 ID
      // 如果存在操作 ID，则排除当前对象的 ID
      if (Number.isInteger(operateId)) {
        andWhere = { id: Not(operateId) }; // // 构建排除条件
      }

      // 查询数据库是否存在指定条件的记录
      return isNil(
        await repo.findOne({
          where: { [condition.field]: value, ...andWhere }, // // 指定查询条件
        }),
      );
    } catch (err) {
      // 如果数据库操作异常，则验证失败
      return false;
    }
  }

  /**
   * 返回验证失败时的默认错误信息
   * @param args 验证参数，包含约束条件和目标对象等信息
   * @returns 验证失败时的错误消息字符串
   */
  defaultMessage(args: ValidationArguments) {
    const { entity, field, message } = args.constraints[0] as Condition;
    const queryProperty = field ?? args.property; // 确定要查询的属性名，如果未指定字段，则使用当前属性名

    if (!entity) return 'Model not been specified!'; // 未指定实体
    if (message) return message; // 如果存在自定义消息，则直接返回该消息
    return `${queryProperty} of ${entity.name} must been unique!`; // 返回一个默认的错误消息
  }
}

/**
 * 数据唯一性验证装饰器工厂函数
 * @param entity Entity类
 * @param validationOptions 验证选项
 */
function IsUnique(
  entity: ObjectType<any>, // 实体类
  validationOptions?: ValidationOptions, // 验证选项
): (object: Record<string, any>, propertyName: string) => void;

/**
 * 数据唯一性验证装饰器工厂函数的重载
 * @param condition 验证条件对象
 * @param validationOptions 验证选项
 */
function IsUnique(
  condition: Condition, // 验证条件对象
  validationOptions?: ValidationOptions, // 验证选项
): (object: Record<string, any>, propertyName: string) => void;

/**
 * 数据唯一性验证装饰器工厂函数的实现
 * @param params 实体类或验证条件对象
 * @param validationOptions 验证选项
 * @returns 一个装饰器函数，接受两个参数：对象和属性名
 */
function IsUnique(
  params: ObjectType<any> | Condition, // 实体类或验证条件对象
  validationOptions?: ValidationOptions, // 可选的验证选项
) {
  return (object: Record<string, any>, propertyName: string) => {
    // 注册自定义验证器
    registerDecorator({
      target: object.constructor, // 目标类的构造函数
      propertyName,
      options: validationOptions, // 验证选项
      constraints: [params], // 将传入的实体类或验证条件对象作为约束条件
      validator: UniqueConstraint, // 自定义验证器
    });
  };
}

export { IsUnique };
