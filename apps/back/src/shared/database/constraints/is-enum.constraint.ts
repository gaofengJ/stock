import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
  registerDecorator,
  ValidationOptions,
} from 'class-validator';

/**
 * 自定义验证器类，用于验证值是否在指定枚举中
 */
@ValidatorConstraint({ name: 'isEnum', async: false })
export class IsEnumConstraint implements ValidatorConstraintInterface {
  /**
   * 验证逻辑：检查值是否在枚举对象中
   */
  validate(value: any, args: ValidationArguments) {
    const [enumObj] = args.constraints;
    return Object.values(enumObj).includes(value);
  }

  /**
   * 默认错误消息：当验证失败时返回的消息
   */
  defaultMessage(args: ValidationArguments) {
    const [enumObj] = args.constraints;
    const allowedValues = Object.values(enumObj).join(', ');
    return `${args.property} must be one of the following values: ${allowedValues}`;
  }
}

export function IsEnum(enumObj: object, validationOptions?: ValidationOptions) {
  return (object: Record<string, any>, propertyName: string) => {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [enumObj],
      validator: IsEnumConstraint,
    });
  };
}
