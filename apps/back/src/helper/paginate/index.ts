import {
  FindManyOptions,
  FindOptionsWhere,
  ObjectLiteral,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';

import { createPaginationObject } from './create-pagination';
import { IPaginationOptions, PaginationTypeEnum } from './interface';
import { Pagination } from './pagination';

const DEFAULT_LIMIT = 10;
const DEFAULT_PAGE = 1;

function resolveOptions(
  options: IPaginationOptions,
): [number, number, PaginationTypeEnum] {
  const { pageNum, pageSize, paginationType } = options;

  return [
    pageNum || DEFAULT_PAGE,
    pageSize || DEFAULT_LIMIT,
    paginationType || PaginationTypeEnum.TAKE_AND_SKIP,
  ];
}

async function paginateRepository<T extends ObjectLiteral>(
  repository: Repository<T>,
  options: IPaginationOptions,
  searchOptions?: FindOptionsWhere<T> | FindManyOptions<T>,
): Promise<Pagination<T>> {
  const [pageNum, limit] = resolveOptions(options);

  const promises: [Promise<T[]>, Promise<number> | undefined] = [
    repository.find({
      skip: limit * (pageNum - 1),
      take: limit,
      ...searchOptions,
    }),
    undefined,
  ];

  const [items, total] = await Promise.all(promises);

  return createPaginationObject<T>({
    items,
    totalItems: total,
    currentPage: pageNum,
    limit,
  });
}

async function paginateQueryBuilder<T extends ObjectLiteral>(
  queryBuilder: SelectQueryBuilder<T>,
  options: IPaginationOptions,
): Promise<Pagination<T>> {
  const [pageNum, limit, paginationType] = resolveOptions(options);

  if (paginationType === PaginationTypeEnum.TAKE_AND_SKIP)
    queryBuilder.take(limit).skip((pageNum - 1) * limit);
  else queryBuilder.limit(limit).offset((pageNum - 1) * limit);

  const [items, total] = await queryBuilder.getManyAndCount();

  return createPaginationObject<T>({
    items,
    totalItems: total,
    currentPage: pageNum,
    limit,
  });
}

export async function paginateRaw<T extends ObjectLiteral>(
  queryBuilder: SelectQueryBuilder<T>,
  options: IPaginationOptions,
): Promise<Pagination<T>> {
  const [pageNum, limit, paginationType] = resolveOptions(options);

  const promises: [Promise<T[]>, Promise<number> | undefined] = [
    (paginationType === PaginationTypeEnum.LIMIT_AND_OFFSET
      ? queryBuilder.limit(limit).offset((pageNum - 1) * limit)
      : queryBuilder.take(limit).skip((pageNum - 1) * limit)
    ).getRawMany<T>(),
    queryBuilder.getCount(),
  ];

  const [items, total] = await Promise.all(promises);

  return createPaginationObject<T>({
    items,
    totalItems: total,
    currentPage: pageNum,
    limit,
  });
}

export async function paginateRawAndEntities<T extends ObjectLiteral>(
  queryBuilder: SelectQueryBuilder<T>,
  options: IPaginationOptions,
): Promise<[Pagination<T>, Partial<T>[]]> {
  const [pageNum, limit, paginationType] = resolveOptions(options);

  const promises: [
    Promise<{ entities: T[]; raw: T[] }>,
    Promise<number> | undefined,
  ] = [
    (paginationType === PaginationTypeEnum.LIMIT_AND_OFFSET
      ? queryBuilder.limit(limit).offset((pageNum - 1) * limit)
      : queryBuilder.take(limit).skip((pageNum - 1) * limit)
    ).getRawAndEntities<T>(),
    queryBuilder.getCount(),
  ];

  const [itemObject, total] = await Promise.all(promises);

  return [
    createPaginationObject<T>({
      items: itemObject.entities,
      totalItems: total,
      currentPage: pageNum,
      limit,
    }),
    itemObject.raw,
  ];
}

export async function paginate<T extends ObjectLiteral>(
  repository: Repository<T>,
  options: IPaginationOptions,
  searchOptions?: FindOptionsWhere<T> | FindManyOptions<T>,
): Promise<Pagination<T>>;
export async function paginate<T extends ObjectLiteral>(
  queryBuilder: SelectQueryBuilder<T>,
  options: IPaginationOptions,
): Promise<Pagination<T>>;

export async function paginate<T extends ObjectLiteral>(
  repositoryOrQueryBuilder: Repository<T> | SelectQueryBuilder<T>,
  options: IPaginationOptions,
  searchOptions?: FindOptionsWhere<T> | FindManyOptions<T>,
) {
  return repositoryOrQueryBuilder instanceof Repository
    ? paginateRepository<T>(repositoryOrQueryBuilder, options, searchOptions)
    : paginateQueryBuilder<T>(repositoryOrQueryBuilder, options);
}
