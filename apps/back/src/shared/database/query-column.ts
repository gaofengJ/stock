import { BadRequestException } from '@nestjs/common';
import { EntityMetadata } from 'typeorm';

const columns = new WeakMap<EntityMetadata, Map<string, string>>();

/** Accept both the published database names and entity properties, never SQL. */
export function queryColumn(metadata: EntityMetadata, field: string): string {
  let allowed = columns.get(metadata);
  if (!allowed) {
    allowed = new Map();
    metadata.columns.forEach((column) => {
      allowed!.set(column.propertyName, column.propertyName);
      allowed!.set(column.databaseName, column.propertyName);
    });
    columns.set(metadata, allowed);
  }
  const property = allowed.get(field);
  if (!property) throw new BadRequestException('不支持的排序或显示字段');
  return property;
}
