import { HttpStatus, Type, applyDecorators } from '@nestjs/common';
import { ApiExtraModels, ApiResponse, getSchemaPath } from '@nestjs/swagger';

import { ResModel } from '@/models/response.model';

const baseTypeNames = ['String', 'Number', 'Boolean']; // 基础类型

/**
 * @description 根据类型生成基本属性
 * @param type
 */
function genBaseProp(type: Type<any>) {
  if (baseTypeNames.includes(type.name))
    return { type: type.name.toLocaleLowerCase() };
  return { $ref: getSchemaPath(type) };
}

/**
 * @description 生成返回结果装饰器
 * @param type 模型的类型
 * @param isPage 是否为分页数据
 * @param HttpStatus Http 状态码
 * @returns Function 返回结果装饰器函数
 */
export function ApiResult<TModel extends Type<any>>({
  type,
  isPage,
  status,
}: {
  type?: TModel | TModel[];
  isPage?: boolean;
  status?: HttpStatus;
}) {
  let prop = null;

  // 根据参数类型和分页标志生成不同的属性结构
  if (Array.isArray(type)) {
    // 如果是分页数据，生成包含分页元数据的对象结构
    if (isPage) {
      prop = {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: { $ref: getSchemaPath(type[0]) },
          },
          meta: {
            type: 'object',
            properties: {
              itemCount: { type: 'number', default: 0 },
              totalItems: { type: 'number', default: 0 },
              itemsPerPage: { type: 'number', default: 0 },
              totalPages: { type: 'number', default: 0 },
              currentPage: { type: 'number', default: 0 },
            },
          },
        },
      };
    } else {
      // 如果不是分页数据，生成包含基本类型的数组结构
      prop = {
        type: 'array',
        items: genBaseProp(type[0]),
      };
    }
  } else if (type) {
    // 如果类型存在，生成对应的基本属性
    prop = genBaseProp(type);
  } else {
    // 如果类型不存在，返回空属性
    prop = { type: 'null', default: null };
  }

  // 获取模型
  const model = Array.isArray(type) ? type[0] : type;

  // 应用 Swagger 装饰器
  return applyDecorators(
    ApiExtraModels(model as TModel), // 制定额外的模型
    ApiResponse({
      status,
      schema: {
        allOf: [
          { $ref: getSchemaPath(ResModel) },
          {
            properties: {
              data: prop,
            },
          },
        ],
      },
    }),
  );
}
