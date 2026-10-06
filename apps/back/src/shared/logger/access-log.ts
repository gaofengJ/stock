/* eslint-disable no-param-reassign -- Fastify hooks attach request-scoped metadata. */
import { randomUUID } from 'crypto';
import { FastifyInstance } from 'fastify';
import { redact } from '@/modules/auth/redact';
import { requestContext, RequestLogContext } from './request-context';

export interface AccessLogEntry extends RequestLogContext {
  timestamp: string;
  route: string;
  statusCode: number;
  durationMs: number;
  result: 'success' | 'client-error' | 'server-error' | 'aborted';
  ip: string;
  ipSource: 'connection' | 'trusted-proxy';
  userAgent: string;
  query: Record<string, string | string[]>;
}

// Keep only useful, non-secret query values. Bodies, cookies, headers and free
// text searches are deliberately not stored, including on authentication APIs.
const queryKeys = new Set([
  'page',
  'pageNum',
  'pageSize',
  'tradeDate',
  'startDate',
  'endDate',
  'year',
  'scope',
  'tradingState',
  'code',
  'tsCode',
  'days',
  'period',
  'mode',
  'status',
]);
export function accessQuery(url: string) {
  const query: Record<string, string | string[]> = {};
  const search = new URLSearchParams(url.split('?')[1] || '');
  queryKeys.forEach((key) => {
    const values = search
      .getAll(key)
      .slice(0, 20)
      .map((value) => String(redact(value)).slice(0, 160));
    if (values.length) query[key] = values.length === 1 ? values[0] : values;
  });
  return query;
}

/** Hooks cover guard/validation failures and unknown API routes as well as
 * successful controllers; an interceptor alone misses rejected requests. */
export function registerAccessLogging(
  server: FastifyInstance,
  write: (entry: AccessLogEntry) => void,
  prefix = '/api',
) {
  server.decorateRequest('logContext', null);
  server.addHook('onRequest', (req, reply, done) => {
    const pathname = req.url.split('?')[0];
    if (pathname !== prefix && !pathname.startsWith(`${prefix}/`)) {
      done();
      return;
    }
    const ctx: RequestLogContext = {
      requestId: randomUUID(),
      method: req.method,
      path: String(redact(pathname)).slice(0, 512),
      actorType: 'anonymous',
    };
    req.logContext = ctx;
    reply.header('X-Request-ID', ctx.requestId);
    const started = process.hrtime.bigint();
    let recorded = false;
    const record = (aborted = false) => {
      if (recorded) return;
      recorded = true;
      const statusCode = aborted ? 499 : reply.statusCode;
      let result: AccessLogEntry['result'] = 'success';
      if (statusCode >= 400) result = 'client-error';
      if (statusCode >= 500) result = 'server-error';
      if (aborted) result = 'aborted';
      const entry: AccessLogEntry = {
        ...ctx,
        timestamp: new Date().toISOString(),
        route: String(redact(req.routeOptions?.url || ctx.path)).slice(0, 512),
        statusCode,
        durationMs: Math.round(Number(process.hrtime.bigint() - started) / 1e6),
        result,
        ip: req.ip,
        ipSource: (req.ips?.length || 0) > 1 ? 'trusted-proxy' : 'connection',
        userAgent: String(redact(req.headers['user-agent'] || '')).slice(
          0,
          512,
        ),
        query: accessQuery(req.url),
      };
      // Logging failures must not turn a completed API request into a failure.
      try {
        write(entry);
      } catch {
        /* The writer reports its own health. */
      }
    };
    reply.raw.once('close', () => {
      if (!reply.raw.writableFinished) record(true);
    });
    req.raw.once('aborted', () => record(true));
    // Use a request-local function; no map grows with client connections.
    (req as typeof req & { finishAccessLog?: () => void }).finishAccessLog =
      () => record();
    requestContext.run(ctx, done);
  });
  server.addHook('onResponse', (req, _reply, done) => {
    (req as typeof req & { finishAccessLog?: () => void }).finishAccessLog?.();
    done();
  });
}
