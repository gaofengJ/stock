/* eslint-disable no-continue -- Skip malformed or filtered streamed records without buffering them. */
/* eslint-disable no-restricted-syntax, no-await-in-loop -- Ordered database operations and bounded streams must execute sequentially. */
import { Injectable, BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import * as dayjs from 'dayjs';
import {
  accessRetentionDays,
  accessSlowMs,
} from '@/shared/logger/access-log.service';
import { reverseLogLines } from './log-lines';
import { LogsQueryDto, AccessLogsQueryDto } from './admin.dto';
import { redact } from '../auth/redact';
import { validRange } from './jobs.service';

export function logDirectory() {
  return path.resolve(process.env.LOG_DIR || path.join(process.cwd(), 'logs'));
}
export function logRange(q: LogsQueryDto) {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const start = q.startDate || today;
  const end = q.endDate || start;
  validRange(start, end);
  if (Date.parse(end) - Date.parse(start) > 6 * 86400000)
    throw new BadRequestException('单次最多查询7天');
  return { start, end };
}
@Injectable()
export class LogsService {
  private readonly summaries = new Map<
    string,
    { expires: number; value: any }
  >();

  constructor(private db: DataSource) {}

  async access(q: AccessLogsQueryDto) {
    const { start, end } = logRange(q);
    const lower = Date.parse(`${start}T00:00:00+08:00`);
    const upper = Date.parse(`${end}T00:00:00+08:00`) + 86400000;
    const firstUTC = new Date(lower).toISOString().slice(0, 10);
    const lastUTC = new Date(upper - 1).toISOString().slice(0, 10);
    let files: string[];
    try {
      files = await fs.promises.readdir(logDirectory());
    } catch (error) {
      if (error.code === 'ENOENT') files = [];
      else throw error;
    }
    const candidates = files
      .flatMap((name) => {
        const match =
          /^stock-access\.(\d{4}-\d{2}-\d{2})\.log(?:\.(\d+))?$/.exec(name);
        return match && match[1] >= firstUTC && match[1] <= lastUTC
          ? [{ name, date: match[1], part: Number(match[2] || 0) }]
          : [];
      })
      .sort((a, b) => b.date.localeCompare(a.date) || b.part - a.part);
    const items: any[] = [];
    const available = new Set<string>();
    const users = new Set<number>();
    const summary = {
      requests: 0,
      failed: 0,
      slow: 0,
      users: 0,
      avgDurationMs: 0,
    };
    let duration = 0;
    let malformed = 0;
    const from = (q.page - 1) * q.pageSize;
    const budget = { bytes: 128 * 1024 * 1024, truncated: false };
    for (const file of candidates) {
      const lines = reverseLogLines(
        path.join(logDirectory(), file.name),
        budget,
      );
      try {
        for await (const line of lines) {
          if (!line.trim()) continue;
          let entry: any;
          try {
            entry = redact(JSON.parse(line));
          } catch {
            malformed += 1;
            continue;
          }
          const time = Date.parse(entry?.timestamp);
          if (
            !entry ||
            entry.kind !== 'access' ||
            !Number.isFinite(time) ||
            !Number.isFinite(entry.durationMs) ||
            !Number.isInteger(entry.statusCode)
          ) {
            malformed += 1;
            continue;
          }
          if (time < lower || time >= upper) continue;
          const date = new Date(time + 8 * 3600000).toISOString().slice(0, 10);
          available.add(date);
          const userMatch = /^\d+$/.test(q.user || '')
            ? String(entry.userId) === q.user
            : [entry.username, entry.nickname].some((v) =>
                String(v ?? '')
                  .toLowerCase()
                  .includes((q.user || '').toLowerCase()),
              );
          if (
            (q.user && !userMatch) ||
            (q.actorType && entry.actorType !== q.actorType) ||
            (q.method && entry.method !== q.method) ||
            (q.result &&
              (q.result === 'failed'
                ? entry.statusCode < 400
                : entry.result !== q.result)) ||
            (q.slow === '1' && entry.durationMs < accessSlowMs()) ||
            (q.path &&
              !String(entry.path).includes(q.path) &&
              !String(entry.route).includes(q.path)) ||
            (q.requestId && entry.requestId !== q.requestId) ||
            (q.keyword &&
              !JSON.stringify(entry)
                .toLowerCase()
                .includes(q.keyword.toLowerCase()))
          )
            continue;
          if (summary.requests >= from && items.length < q.pageSize)
            items.push({ ...entry, id: entry.requestId });
          summary.requests += 1;
          if (entry.statusCode >= 400) summary.failed += 1;
          if (entry.durationMs >= accessSlowMs()) summary.slow += 1;
          if (entry.actorType === 'user' && entry.userId)
            users.add(entry.userId);
          duration += entry.durationMs;
        }
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      } finally {
        await lines.return(undefined);
      }
      if (budget.truncated) break;
    }
    summary.users = users.size;
    summary.avgDurationMs = summary.requests
      ? Math.round(duration / summary.requests)
      : 0;
    return {
      items,
      total: summary.requests,
      summary,
      slowMs: accessSlowMs(),
      availableDates: [...available].sort().reverse(),
      malformed,
      truncated: budget.truncated,
      retentionDays: accessRetentionDays(),
      range: { startDate: start, endDate: end },
    };
  }

  async application(q: LogsQueryDto) {
    const { start, end } = logRange(q);
    const items: any[] = [];
    let total = 0;
    let malformed = 0;
    const levels: Record<string, number> = {};
    const trend: Record<string, number> = {};
    const availableDates: string[] = [];
    const from = (q.page - 1) * q.pageSize;
    const budget = { bytes: 128 * 1024 * 1024, truncated: false };
    // Main log contains errors too; never double-count the separate error file.
    for (
      let d = dayjs(end);
      d.valueOf() >= dayjs(start).valueOf();
      d = d.subtract(1, 'day')
    ) {
      const date = d.format('YYYY-MM-DD');
      const filename = path.join(logDirectory(), `stock-back.${date}.log`);
      if (!fs.existsSync(filename)) continue;
      availableDates.push(date);
      const lines = reverseLogLines(filename, budget);
      try {
        for await (const line of lines) {
          if (!line.trim()) continue;
          let entry: any;
          try {
            entry = JSON.parse(line);
            if (!entry || typeof entry !== 'object') throw new Error();
          } catch {
            malformed += 1;
            continue;
          }
          entry = redact(entry);
          const context = String(entry.context || '');
          if (
            (q.view === 'issues' && !['error', 'warn'].includes(entry.level)) ||
            (q.level && entry.level !== q.level) ||
            (q.module && !context.includes(q.module)) ||
            (q.requestId && entry.requestId !== q.requestId) ||
            (q.keyword && !JSON.stringify(entry).includes(q.keyword))
          )
            continue;
          levels[entry.level || 'unknown'] =
            (levels[entry.level || 'unknown'] || 0) + 1;
          if (entry.level === 'error') trend[date] = (trend[date] || 0) + 1;
          if (total >= from && items.length < q.pageSize)
            items.push({ ...entry, id: `${date}:${total}` });
          total += 1;
        }
      } finally {
        await lines.return(undefined);
      }
      if (budget.truncated) break;
    }
    return {
      items,
      total,
      levels,
      trend,
      availableDates,
      malformed,
      truncated: budget.truncated,
      retentionDays: Number(process.env.LOGGER_MAX_FILES || 5),
      range: { startDate: start, endDate: end },
    };
  }

  async audit(q: LogsQueryDto) {
    const { start, end } = logRange(q);
    let where =
      ' WHERE created_at>=? AND created_at<DATE_ADD(?,INTERVAL 1 DAY)';
    // Audit stored in UTC, filters interpreted as Shanghai calendar dates.
    const args: any[] = [
      new Date(`${start}T00:00:00+08:00`),
      new Date(`${end}T00:00:00+08:00`),
    ];
    for (const [column, value] of [
      ['actor_name', q.user],
      ['action', q.action],
      ['result', q.result],
    ])
      if (value) {
        where += ` AND ${column} LIKE ?`;
        args.push(`%${value}%`);
      }
    if (q.keyword) {
      where +=
        ' AND (actor_name LIKE ? OR action LIKE ? OR target LIKE ? OR detail LIKE ?)';
      args.push(...Array(4).fill(`%${q.keyword}%`));
    }
    if (q.requestId) {
      where += ' AND detail LIKE ?';
      args.push(`%"requestId":"${q.requestId}"%`);
    }
    const [{ total }] = await this.db.query(
      `SELECT COUNT(*) total FROM t_auth_audit${where}`,
      args,
    );
    const items = await this.db.query(
      `SELECT id,actor_name actorName,action,target,result,detail,created_at createdAt FROM t_auth_audit${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
      [...args, q.pageSize, (q.page - 1) * q.pageSize],
    );
    return {
      items: items.map((x: any) => redact(x)),
      total: Number(total),
      retentionDays: 90,
      range: { startDate: start, endDate: end },
    };
  }

  async stats(q: LogsQueryDto) {
    const { start, end } = logRange(q);
    const key = `${start}:${end}`;
    const cached = this.summaries.get(key);
    if (q.refresh !== '1' && cached && cached.expires > Date.now())
      return cached.value;
    const sync = await this.db.query(
      "SELECT CASE WHEN actor_id IS NULL THEN 'scheduled' ELSE 'manual' END source,status,COUNT(*) count FROM t_admin_job WHERE created_at>=? AND created_at<DATE_ADD(?,INTERVAL 1 DAY) GROUP BY source,status",
      [new Date(`${start}T00:00:00+08:00`), new Date(`${end}T00:00:00+08:00`)],
    );
    // Count jobs once, not scheduled invocation audit events (a different unit).
    const value = { sync, generatedAt: new Date().toISOString() };
    if (this.summaries.size >= 32)
      this.summaries.delete(this.summaries.keys().next().value);
    this.summaries.set(key, { expires: Date.now() + 30000, value });
    return value;
  }
}
