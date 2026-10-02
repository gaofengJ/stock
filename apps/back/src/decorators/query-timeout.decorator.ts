import { SetMetadata } from '@nestjs/common';

export const QUERY_TIMEOUT_MS = '__QUERY_TIMEOUT_MS';
export const QueryTimeout = (milliseconds: number) =>
  SetMetadata(QUERY_TIMEOUT_MS, milliseconds);
