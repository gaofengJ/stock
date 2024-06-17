import { IPaginationMeta } from './interface';
import { Pagination } from './pagination';

export function createPaginationObject<T>({
  items,
  totalItems,
  currentPage,
  limit,
}: {
  items: T[];
  totalItems?: number;
  currentPage: number;
  limit: number;
}): Pagination<T> {
  const totalPages =
    totalItems !== undefined ? Math.ceil(totalItems / limit) : undefined;

  const meta: IPaginationMeta = {
    totalItems, // 数据库中符合条件的总记录数
    itemCount: items.length, // 当前页返回的记录数
    itemsPerPage: limit, // 每页显示的记录数
    totalPages, // 总的分页数
    currentPage, // 当前请求的页码
  };

  return new Pagination<T>(items, meta);
}
