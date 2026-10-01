/* eslint-disable no-restricted-syntax, no-await-in-loop -- Ordered database operations and bounded streams must execute sequentially. */
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { createHash } from 'crypto';
import * as dayjs from 'dayjs';
import { permanentSyncError } from '../daily-task/sync.utils';
import { redact } from '../auth/redact';
import { DailyTaskService } from '../daily-task/daily-task.service';
import { AuthService, CurrentUser } from '../auth/auth.service';
import { PageDto } from '../auth/auth.dto';
import { DataLockService } from './data-lock.service';

export function validRange(start: string, end: string) {
  for (const d of [start, end])
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(d) ||
      !Number.isFinite(Date.parse(d)) ||
      new Date(d).toISOString().slice(0, 10) !== d
    )
      throw new BadRequestException('日期必须是有效的 YYYY-MM-DD');
  if (
    start > end ||
    start < dayjs(end).subtract(2, 'year').format('YYYY-MM-DD')
  )
    throw new BadRequestException('日期范围必须正序且不超过两个自然年');
}
@Injectable()
export class JobsService implements OnApplicationBootstrap {
  private busy = false;

  private logger = new Logger(JobsService.name);

  constructor(
    private db: DataSource,
    private daily: DailyTaskService,
    private auth: AuthService,
    private locks: DataLockService,
  ) {}

  async onApplicationBootstrap() {
    if (this.daily.marketEnabled) {
      try {
        await this.locks.run(() =>
          this.db.query(
            "UPDATE t_admin_job SET status='queued',stage='服务重启，从已记录进度继续' WHERE status='running'",
          ),
        );
      } catch (e) {
        if (e.status !== 409) throw e;
      }
      return;
    }
    try {
      await this.locks.run(async () => {
        const interrupted = await this.db.query(
          "SELECT id,actor_id,actor_name FROM t_admin_job WHERE status='running'",
        );
        await this.db.query(
          "UPDATE t_admin_job SET status='interrupted',active_key=NULL,finished_at=UTC_TIMESTAMP(6),error='服务重启，任务中断，请检查后重新提交' WHERE status='running'",
        );
        for (const job of interrupted)
          await this.auth.audit(
            { id: job.actor_id, username: job.actor_name },
            'sync.complete',
            job.id,
            'interrupted',
          );
      });
    } catch (e) {
      if (e.status !== 409) throw e;
    }
  }

  async create(
    actor: CurrentUser,
    start: string,
    end: string,
    mode: 'missing' | 'refresh' | 'breadth' | 'sector' = 'missing',
  ) {
    validRange(start, end);
    const key = createHash('sha256')
      .update(`${mode}:${start}:${end}`)
      .digest('hex');
    return this.db.transaction(async (m) => {
      await m.query(
        'INSERT INTO t_admin_job(actor_id,actor_name,start_date,end_date,status,active_key,mode,created_at,updated_at) VALUES (?,?,?,?,?,?,?,UTC_TIMESTAMP(6),UTC_TIMESTAMP(6)) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)',
        [actor.id, actor.username, start, end, 'queued', key, mode],
      );
      const [job] = await m.query(
        'SELECT id,status FROM t_admin_job WHERE active_key=?',
        [key],
      );
      await this.auth.audit(
        actor,
        'sync.submit',
        job.id,
        'success',
        { startDate: start, endDate: end },
        m,
      );
      return job;
    });
  }

  async list(q: PageDto) {
    const [{ total }] = await this.db.query(
      'SELECT COUNT(*) total FROM t_admin_job',
    );
    const items = await this.db.query(
      'SELECT id,mode,actor_name actorName,DATE_FORMAT(start_date,"%Y-%m-%d") startDate,DATE_FORMAT(end_date,"%Y-%m-%d") endDate,status,stage,started_at startedAt,finished_at finishedAt,created_at createdAt,error FROM t_admin_job ORDER BY id DESC LIMIT ? OFFSET ?',
      [q.pageSize, (q.page - 1) * q.pageSize],
    );
    return { items, total: Number(total) };
  }

  async detail(id: number) {
    const [job] = await this.db.query(
      'SELECT *,DATE_FORMAT(start_date,"%Y-%m-%d") startDate,DATE_FORMAT(end_date,"%Y-%m-%d") endDate FROM t_admin_job WHERE id=?',
      [id],
    );
    if (!job) throw new NotFoundException('任务不存在');
    const dates = await this.db.query(
      "SELECT task,DATE_FORMAT(trade_date,'%Y-%m-%d') tradeDate,status,daily_count dailyCount,limit_count limitCount,senti_count sentiCount,error,updated_at updatedAt FROM t_sync_run WHERE task IN ('daily','market-index','market','market-breadth','ths-catalog','ths-daily') AND trade_date BETWEEN ? AND ? ORDER BY trade_date,task",
      [job.startDate, job.endDate],
    );
    return { ...job, dates };
  }

  @Interval(5000)
  async tick() {
    if (this.busy || process.env.ADMIN_JOBS_ENABLED === 'false') return;
    this.busy = true;
    try {
      if (this.daily.marketEnabled) {
        await this.tickMarket();
        return;
      }
      await this.locks.run(async () => {
        const [job] = await this.db.query(
          "SELECT *,DATE_FORMAT(start_date,'%Y-%m-%d') startDate,DATE_FORMAT(end_date,'%Y-%m-%d') endDate FROM t_admin_job WHERE status='queued' ORDER BY id LIMIT 1",
        );
        if (!job) return;
        // Recheck permission after queuing; revoked users must not execute later.
        try {
          const u = await this.auth.current(job.actor_id);
          if (!u.permissions.includes('sync:run') || u.mustChangePassword)
            throw new Error('提交者已失去同步权限');
        } catch {
          await this.db.query(
            "UPDATE t_admin_job SET status='failed',active_key=NULL,error='提交者已失去同步权限',finished_at=UTC_TIMESTAMP(6) WHERE id=?",
            [job.id],
          );
          await this.auth.audit(
            { id: job.actor_id, username: job.actor_name },
            'sync.complete',
            job.id,
            'failed',
            { reason: '提交者已失去同步权限' },
          );
          return;
        }
        await this.db.query(
          "UPDATE t_admin_job SET status='running',stage='准备基础数据',started_at=UTC_TIMESTAMP(6) WHERE id=?",
          [job.id],
        );
        const completed: string[] = [];
        const progress = async (date: string) => {
          completed.push(date);
          await this.db.query(
            'UPDATE t_admin_job SET stage=?,completed_dates=? WHERE id=?',
            [`已完成 ${date}`, JSON.stringify(completed), job.id],
          );
        };
        let status = 'success';
        let error: string | null = null;
        try {
          if (job.startDate === job.endDate) {
            await this.daily.import(job.startDate);
            await progress(job.startDate);
          } else
            await this.daily.bulkImport(job.startDate, job.endDate, progress);
          const [{ n }] = await this.db.query(
            "SELECT COUNT(*) n FROM t_sync_run WHERE task='daily' AND trade_date BETWEEN ? AND ? AND status<>'success'",
            [job.startDate, job.endDate],
          );
          if (Number(n)) status = 'pending';
        } catch (e) {
          status = 'failed';
          error = String(redact(e.message || '同步失败')).slice(0, 2000);
        }
        await this.db.query(
          'UPDATE t_admin_job SET status=?,stage=?,error=?,finished_at=UTC_TIMESTAMP(6),active_key=NULL WHERE id=?',
          [
            status,
            (
              {
                success: '执行完成',
                pending: '执行结束，部分数据待补齐',
              } as Record<string, string>
            )[status] || '执行失败',
            error,
            job.id,
          ],
        );
        await this.auth.audit(
          { id: job.actor_id, username: job.actor_name },
          'sync.complete',
          job.id,
          status,
          { completedDates: completed, error },
        );
      });
    } catch (e) {
      if (e.status !== 409) this.logger.error(`任务调度失败: ${e.message}`);
    } finally {
      this.busy = false;
    }
  }

  private async tickMarket() {
    await this.locks.run(async () => {
      const [job] = await this.db.query(
        "SELECT *,DATE_FORMAT(start_date,'%Y-%m-%d') startDate,DATE_FORMAT(end_date,'%Y-%m-%d') endDate FROM t_admin_job WHERE status IN ('queued','running') OR (status='pending' AND active_key IS NOT NULL AND updated_at<DATE_SUB(UTC_TIMESTAMP(6),INTERVAL 5 MINUTE)) ORDER BY (actor_id IS NULL AND mode='refresh') DESC,(mode IN ('breadth','sector')) ASC,(mode='sector') DESC,id LIMIT 1",
      );
      if (!job) return;
      if (job.actor_id !== null) {
        try {
          const user = await this.auth.current(job.actor_id);
          if (!user.permissions.includes('sync:run') || user.mustChangePassword)
            throw new Error('提交者已失去同步权限');
        } catch {
          await this.db.query(
            "UPDATE t_admin_job SET status='failed',active_key=NULL,error='提交者已失去同步权限',finished_at=UTC_TIMESTAMP(6) WHERE id=?",
            [job.id],
          );
          return;
        }
      }
      const completed: string[] =
        typeof job.completed_dates === 'string'
          ? JSON.parse(job.completed_dates)
          : job.completed_dates || [];
      await this.db.query(
        "UPDATE t_admin_job SET status='running',started_at=COALESCE(started_at,UTC_TIMESTAMP(6)),stage=? WHERE id=?",
        [
          job.mode === 'sector'
            ? '正在补齐同花顺成分和板块日线'
            : '校验并补齐下一批，最多3个交易日',
          job.id,
        ],
      );
      try {
        let result;
        if (job.mode === 'sector')
          result = await this.daily.sectorBatch(job.startDate, job.endDate);
        else if (job.mode === 'breadth')
          result = await this.daily.breadthBatch(job.startDate, job.endDate);
        else
          result = await this.daily.marketBatch(
            job.startDate,
            job.endDate,
            job.mode === 'refresh',
            completed,
          );
        if (!result) return;
        const done = [
          ...new Set([
            ...completed,
            ...result.completed.filter(
              (d) => d >= job.startDate && d <= job.endDate,
            ),
          ]),
        ];
        const permanent = result.failures.some(permanentSyncError);
        const blocked =
          result.protectedDates.length > 0 && result.remaining === 0;
        let status = result.remaining ? 'queued' : 'success';
        if (result.failures.length) status = 'pending';
        if (permanent || blocked) status = 'failed';
        const terminal = status === 'success' || status === 'failed';
        const error =
          [
            ...result.failures,
            ...(blocked
              ? [`主动删除保护：${result.protectedDates.join('、')}`]
              : []),
          ].join('\n') || null;
        await this.db.query(
          'UPDATE t_admin_job SET status=?,stage=?,completed_dates=?,error=?,active_key=?,finished_at=?,updated_at=UTC_TIMESTAMP(6) WHERE id=?',
          [
            status,
            'stage' in result
              ? String(result.stage)
              : `已处理 ${done.length} 日，待补 ${result.remaining} 日${
                  result.protectedDates.length
                    ? `，保护 ${result.protectedDates.length} 日`
                    : ''
                }`,
            JSON.stringify(done),
            error,
            terminal ? null : job.active_key,
            terminal ? new Date() : null,
            job.id,
          ],
        );
        if (terminal)
          await this.auth.audit(
            job.actor_id === null
              ? null
              : { id: job.actor_id, username: job.actor_name },
            'sync.complete',
            job.id,
            status,
            { error },
          );
      } catch (e) {
        const permanent = permanentSyncError(e);
        await this.db.query(
          'UPDATE t_admin_job SET status=?,error=?,active_key=?,updated_at=UTC_TIMESTAMP(6) WHERE id=?',
          [
            permanent ? 'failed' : 'pending',
            String(redact(e.message)).slice(0, 2000),
            permanent ? null : job.active_key,
            job.id,
          ],
        );
      }
    });
  }
}
