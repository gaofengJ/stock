import {
  ArgumentMetadata,
  ParseArrayPipe,
  Type,
  UnprocessableEntityException,
} from '@nestjs/common';

/** Validate every bulk item with the same rules used by single-record writes. */
export class DtoArrayPipe extends ParseArrayPipe {
  constructor(
    items: Type<unknown>,
    private readonly maxItems = 10000,
  ) {
    super({
      items,
      whitelist: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: true },
      errorHttpStatusCode: 422,
    });
  }

  async transform(value: unknown, metadata: ArgumentMetadata) {
    if (!Array.isArray(value) || value.length > this.maxItems)
      throw new UnprocessableEntityException(
        `批量数据必须是数组，且不超过 ${this.maxItems} 条`,
      );
    if (
      value.some(
        (item) => !item || typeof item !== 'object' || Array.isArray(item),
      )
    )
      throw new UnprocessableEntityException('每条数据必须是对象');
    return super.transform(value, metadata);
  }
}
