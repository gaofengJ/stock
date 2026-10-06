import { AsyncLocalStorage } from 'async_hooks';

export interface RequestLogContext {
  requestId: string;
  method: string;
  path: string;
  actorType: 'user' | 'guest' | 'anonymous';
  userId?: number;
  username?: string;
  nickname?: string;
  errorMessage?: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    logContext?: RequestLogContext;
  }
}

export const requestContext = new AsyncLocalStorage<RequestLogContext>();

/** Copy only non-secret request metadata, at the moment the log is emitted. */
export function requestLogFields() {
  const ctx = requestContext.getStore();
  if (!ctx) return {};
  return {
    requestId: ctx.requestId,
    method: ctx.method,
    path: ctx.path,
    actorType: ctx.actorType,
    userId: ctx.userId,
    username: ctx.username,
  };
}
