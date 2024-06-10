import { ObjectLiteral } from 'typeorm';

/**
 * @description 分页类型的枚举
 */
export enum PaginationTypeEnum {
  /**
   * 使用 limit 和 offset 进行分页
   */
  LIMIT_AND_OFFSET = 'limit',
  /**
   * 使用 take 和 skip 进行分页
   */
  TAKE_AND_SKIP = 'take',
}

/**
 * @description 定义分页选项
 */
export interface IPaginationOptions {
  /**
   * 当前页码
   */
  pageNum: number;
  /**
   * 每页显示的项目数
   */
  pageSize: number;
  /**
   * 可选的分页类型
   */
  paginationType?: PaginationTypeEnum;
}

/**
 * @description 定义分页元数据，继承自 ObjectLiteral
 */
export interface IPaginationMeta extends ObjectLiteral {
  /**
   * 当前页包含的项目数
   */
  itemCount: number;
  /**
   * 总项目数
   */
  total?: number;
  /**
   * 每页包含的项目数
   */
  itemsPerPage: number;
  /**
   * 总页数
   */
  totalPages?: number;
  /**
   * 当前页码
   */
  currentPage: number;
}

/**
 * @description 定义分页链接接口
 */
export interface IPaginationLinks {
  /**
   * 第一页的链接
   */
  first?: string;
  /**
   * 前一页的链接
   */
  previous?: string;
  /**
   * 下一页的链接
   */
  next?: string;
  /**
   * 最后一页的链接
   */
  last?: string;
}
