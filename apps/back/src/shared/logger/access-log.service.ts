import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import * as path from 'path';
import {
  createLogger,
  format,
  Logger as WinstonLogger,
  transports,
} from 'winston';
import 'winston-daily-rotate-file';
import { redact } from '@/modules/auth/redact';
import { AccessLogEntry } from './access-log';

export function accessRetentionDays() {
  const days = Number(process.env.ACCESS_LOG_RETENTION_DAYS || 30);
  return Number.isInteger(days) && days >= 1 && days <= 180 ? days : 30;
}
export function accessSlowMs() {
  const ms = Number(process.env.ACCESS_LOG_SLOW_MS || 1000);
  return Number.isInteger(ms) && ms >= 100 && ms <= 60000 ? ms : 1000;
}

@Injectable()
export class AccessLogService implements OnModuleDestroy {
  private readonly writer: WinstonLogger;

  private lastFailure = 0;

  constructor() {
    const directory = process.env.LOG_DIR || path.join(process.cwd(), 'logs');
    this.writer = createLogger({
      level: 'info',
      format: format.json(),
      transports: [
        new transports.DailyRotateFile({
          filename: path.join(directory, 'stock-access.%DATE%.log'),
          datePattern: 'YYYY-MM-DD',
          utc: true,
          maxSize: '20m',
          maxFiles: `${accessRetentionDays()}d`,
          auditFile: path.join(directory, '.audit/stock-access.json'),
          options: { flags: 'a', mode: 0o600 },
        }),
      ],
    });
    this.writer.on('error', () => this.reportFailure());
    this.writer.transports.forEach((transport) =>
      transport.on('error', () => this.reportFailure()),
    );
  }

  private reportFailure() {
    if (Date.now() - this.lastFailure < 60000) return;
    this.lastFailure = Date.now();
    Logger.error(
      '接口访问日志写入失败，请检查日志目录权限和磁盘空间',
      undefined,
      'AccessLogService',
    );
  }

  write(entry: AccessLogEntry) {
    try {
      this.writer.log('info', 'API access', {
        ...redact(entry),
        kind: 'access',
      });
    } catch {
      this.reportFailure();
    }
  }

  async onModuleDestroy() {
    await new Promise<void>((resolve) => {
      this.writer.once('finish', resolve);
      this.writer.end();
    });
    this.writer.close();
  }
}
