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
  if (start > end || Date.parse(end) - Date.parse(start) > 366 * 86400000)
    throw new BadRequestException('日期范围必须正序且不超过366天');
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

  async create(actor: CurrentUser, start: string, end: string) {
    validRange(start, end);
    const key = createHash('sha256').update(`${start}:${end}`).digest('hex');
    return this.db.transaction(async (m) => {
      await m.query(
        'INSERT INTO t_admin_job(actor_id,actor_name,start_date,end_date,status,active_key,created_at,updated_at) VALUES (?,?,?,?,?,?,UTC_TIMESTAMP(6),UTC_TIMESTAMP(6)) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)',
        [actor.id, actor.username, start, end, 'queued', key],
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
      'SELECT id,actor_name actorName,DATE_FORMAT(start_date,"%Y-%m-%d") startDate,DATE_FORMAT(end_date,"%Y-%m-%d") endDate,status,stage,started_at startedAt,finished_at finishedAt,created_at createdAt,error FROM t_admin_job ORDER BY id DESC LIMIT ? OFFSET ?',
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
      'SELECT task,DATE_FORMAT(trade_date,"%Y-%m-%d") tradeDate,status,daily_count dailyCount,limit_count limitCount,senti_count sentiCount,error,updated_at updatedAt FROM t_sync_run WHERE task="daily" AND trade_date BETWEEN ? AND ? ORDER BY trade_date',
      [job.startDate, job.endDate],
    );
    return { ...job, dates };
  }

  @Interval(5000)
  async tick() {
    if (this.busy || process.env.ADMIN_JOBS_ENABLED === 'false') return;
    this.busy = true;
    try {
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
}
