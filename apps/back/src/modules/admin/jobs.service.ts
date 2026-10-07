/* eslint-disable no-restricted-syntax, no-await-in-loop -- Ordered database operations and bounded streams must execute sequentially. */
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { createHash } from 'crypto';
import * as dayjs from 'dayjs';
import { permanentSyncError, SyncBatchResult } from '../daily-task/sync.utils';
import { redact } from '../auth/redact';
import { DailyTaskService } from '../daily-task/daily-task.service';
import { AuthService, CurrentUser } from '../auth/auth.service';
import { SyncJobsQueryDto } from './admin.dto';
import { DataLockService } from './data-lock.service';
import { JobControl, MAX_JOB_FAILURES, retryOutcome } from './job-policy';

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
        await this.locks.run(async () => {
          await this.settleStoppedJobs();
          await this.db.query(
            "UPDATE t_admin_job SET status='queued',stage='服务重启，从已记录进度继续' WHERE status='running'",
          );
        });
      } catch (e) {
        if (e.status !== 409) throw e;
      }
      return;
    }
    try {
      await this.locks.run(async () => {
        await this.settleStoppedJobs();
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
    mode:
      | 'missing'
      | 'refresh'
      | 'breadth'
      | 'sector'
      | 'technical'
      | 'insights'
      | 'hot' = 'missing',
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

  async list(q: SyncJobsQueryDto) {
    const conditions: string[] = [];
    const parameters: string[] = [];
    if (q.status) {
      conditions.push('status=?');
      parameters.push(q.status);
    }
    if (q.mode) {
      conditions.push('mode=?');
      parameters.push(q.mode);
    }
    if (!!q.startDate !== !!q.endDate)
      throw new BadRequestException('请选择完整的任务日期范围');
    if (q.startDate && q.endDate) {
      // Search task ranges by overlap; history searches have no two-year limit.
      validRange(q.startDate, q.startDate);
      validRange(q.endDate, q.endDate);
      if (q.startDate > q.endDate)
        throw new BadRequestException('日期范围必须正序');
      conditions.push('end_date>=? AND start_date<=?');
      parameters.push(q.startDate, q.endDate);
    }
    if (q.keyword?.trim()) {
      const keyword = `%${q.keyword.trim().replace(/[=%_]/g, '=$&')}%`;
      conditions.push(
        "(CAST(id AS CHAR) LIKE ? ESCAPE '=' OR actor_name LIKE ? ESCAPE '=')",
      );
      parameters.push(keyword, keyword);
    }
    const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
    return this.db.transaction('REPEATABLE READ', async (m) => {
      const [{ total: count }] = await m.query(
        `SELECT COUNT(*) total FROM t_admin_job${where}`,
        parameters,
      );
      const total = Number(count);
      const page = Math.min(q.page, Math.max(1, Math.ceil(total / q.pageSize)));
      const items = await m.query(
        `SELECT id,mode,actor_id actorId,actor_name actorName,DATE_FORMAT(start_date,"%Y-%m-%d") startDate,DATE_FORMAT(end_date,"%Y-%m-%d") endDate,status,stage,retry_count retryCount,next_retry_at nextRetryAt,last_progress_at lastProgressAt,started_at startedAt,finished_at finishedAt,created_at createdAt,error FROM t_admin_job${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
        [...parameters, q.pageSize, (page - 1) * q.pageSize],
      );
      const counts = await m.query(
        'SELECT status,COUNT(*) count FROM t_admin_job GROUP BY status',
      );
      const summary: Record<string, number> = {};
      for (const row of counts) summary[row.status] = Number(row.count);
      return {
        items,
        total,
        page,
        pageSize: q.pageSize,
        summary,
        maxFailures: MAX_JOB_FAILURES,
      };
    });
  }

  async detail(id: number) {
    const [job] = await this.db.query(
      'SELECT *,DATE_FORMAT(start_date,"%Y-%m-%d") startDate,DATE_FORMAT(end_date,"%Y-%m-%d") endDate FROM t_admin_job WHERE id=?',
      [id],
    );
    if (!job) throw new NotFoundException('任务不存在');
    const dates = await this.db.query(
      "SELECT task,DATE_FORMAT(trade_date,'%Y-%m-%d') tradeDate,status,daily_count dailyCount,limit_count limitCount,senti_count sentiCount,error,updated_at updatedAt FROM t_sync_run WHERE task IN ('daily','market-index','market','market-breadth','ths-catalog','ths-daily','strategy-factor','stock-insight','ths-hot') AND trade_date BETWEEN ? AND ? ORDER BY trade_date,task",
      [job.startDate, job.endDate],
    );
    return { ...job, dates, maxFailures: MAX_JOB_FAILURES };
  }

  async control(actor: CurrentUser, id: number, action: JobControl) {
    try {
      return await this.db.transaction(async (m) => {
        const [job] = await m.query(
          'SELECT *,DATE_FORMAT(start_date,"%Y-%m-%d") startDate,DATE_FORMAT(end_date,"%Y-%m-%d") endDate FROM t_admin_job WHERE id=? FOR UPDATE',
          [id],
        );
        if (!job) throw new NotFoundException('任务不存在');
        let status: string;
        if (action === 'retry') {
          if (
            !['pending', 'paused', 'failed', 'interrupted'].includes(job.status)
          )
            throw new ConflictException('当前任务不能重试，请刷新状态');
          const key =
            job.active_key ||
            createHash('sha256')
              .update(`${job.mode}:${job.startDate}:${job.endDate}`)
              .digest('hex');
          status = 'queued';
          await m.query(
            "UPDATE t_admin_job SET status='queued',stage='已重新排队，将继续校验并补齐',retry_count=0,next_retry_at=NULL,finished_at=NULL,error=NULL,active_key=? WHERE id=?",
            [key, id],
          );
        } else {
          const allowed =
            action === 'pause'
              ? ['queued', 'pending', 'running']
              : ['queued', 'pending', 'running', 'paused', 'pausing'];
          if (!allowed.includes(job.status))
            throw new ConflictException('当前任务不能执行此操作，请刷新状态');
          const running = ['running', 'pausing'].includes(job.status);
          if (action === 'pause') status = running ? 'pausing' : 'paused';
          else status = running ? 'cancelling' : 'cancelled';
          let stage = action === 'pause' ? '已暂停' : '已取消';
          if (running) stage = '已收到请求，当前批次结束后停止';
          await m.query(
            'UPDATE t_admin_job SET status=?,stage=?,next_retry_at=NULL,active_key=?,finished_at=? WHERE id=?',
            [
              status,
              stage,
              status === 'cancelled' ? null : job.active_key,
              status === 'cancelled' ? new Date() : null,
              id,
            ],
          );
        }
        await this.auth.audit(
          actor,
          `sync.${action}`,
          id,
          'success',
          { status },
          m,
        );
        return { id, status };
      });
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY')
        throw new ConflictException('相同范围已有任务，请先处理该任务');
      throw e;
    }
  }

  // Only call while holding the global worker lock: no batch can still be writing.
  private async settleStoppedJobs() {
    await this.db.query(
      "UPDATE t_admin_job SET status='paused',stage='已暂停',next_retry_at=NULL WHERE status='pausing'",
    );
    await this.db.query(
      "UPDATE t_admin_job SET status='cancelled',stage='已取消',next_retry_at=NULL,active_key=NULL,finished_at=UTC_TIMESTAMP(6) WHERE status='cancelling'",
    );
    if (this.daily.marketEnabled)
      await this.db.query(
        "UPDATE t_admin_job SET status='queued',stage='从已记录进度继续' WHERE status='running'",
      );
  }

  private async finish(
    job: any,
    status: string,
    completed: string[],
    error: string | null,
    stage: string,
    sourceRetryAt?: Date,
  ) {
    return this.db.transaction(async (m) => {
      const [current] = await m.query(
        'SELECT status,retry_count,completed_dates FROM t_admin_job WHERE id=? FOR UPDATE',
        [job.id],
      );
      let requestedStatus = status;
      if (current.status === 'pausing') requestedStatus = 'paused';
      if (current.status === 'cancelling') requestedStatus = 'cancelled';
      if (['paused', 'cancelled'].includes(current.status))
        requestedStatus = current.status;
      const outcome = retryOutcome(
        requestedStatus,
        Number(current.retry_count || 0),
        Date.now(),
        sourceRetryAt,
      );
      const finalStatus = outcome.status;
      const terminal = ['success', 'failed', 'cancelled'].includes(finalStatus);
      const finalError = outcome.exhausted
        ? `${
            error || '部分数据仍未补齐'
          }\n已达到 ${MAX_JOB_FAILURES} 次失败上限，请检查后手动重试`
        : error;
      const stages: Record<string, string> = {
        paused: '已暂停',
        cancelled: '已取消',
      };
      const previous = JSON.stringify(
        typeof current.completed_dates === 'string'
          ? JSON.parse(current.completed_dates)
          : current.completed_dates || [],
      );
      await m.query(
        'UPDATE t_admin_job SET status=?,stage=?,completed_dates=?,error=?,retry_count=?,next_retry_at=?,active_key=?,finished_at=?,last_progress_at=IF(?,UTC_TIMESTAMP(6),last_progress_at),updated_at=UTC_TIMESTAMP(6) WHERE id=?',
        [
          finalStatus,
          stages[finalStatus] ||
            (outcome.exhausted ? '重试已停止，等待人工处理' : stage),
          JSON.stringify(completed),
          finalError ? String(redact(finalError)).slice(0, 2000) : null,
          outcome.failures,
          finalStatus === 'pending' ? outcome.nextRetryAt : null,
          terminal ? null : job.active_key,
          terminal ? new Date() : null,
          previous !== JSON.stringify(completed),
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
          finalStatus,
          { error: finalError },
          m,
        );
      return finalStatus;
    });
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
        await this.settleStoppedJobs();
        const [job] = await this.db.query(
          "SELECT *,DATE_FORMAT(start_date,'%Y-%m-%d') startDate,DATE_FORMAT(end_date,'%Y-%m-%d') endDate FROM t_admin_job WHERE status='queued' OR (status='pending' AND active_key IS NOT NULL AND retry_count<5 AND COALESCE(next_retry_at,DATE_ADD(updated_at,INTERVAL 5 MINUTE))<=UTC_TIMESTAMP(6)) ORDER BY id LIMIT 1",
        );
        if (!job) return;
        // Recheck permission after queuing; revoked users must not execute later.
        try {
          const u = await this.auth.current(job.actor_id);
          if (!u.permissions.includes('sync:run') || u.mustChangePassword)
            throw new Error('提交者已失去同步权限');
        } catch {
          await this.finish(
            job,
            'failed',
            typeof job.completed_dates === 'string'
              ? JSON.parse(job.completed_dates)
              : job.completed_dates || [],
            '提交者已失去同步权限',
            '执行失败',
          );
          return;
        }
        const claim = await this.db.query(
          "UPDATE t_admin_job SET status='running',stage='准备基础数据',next_retry_at=NULL,started_at=COALESCE(started_at,UTC_TIMESTAMP(6)) WHERE id=? AND status IN ('queued','pending')",
          [job.id],
        );
        if (!claim.affectedRows) return;
        const completed: string[] =
          typeof job.completed_dates === 'string'
            ? JSON.parse(job.completed_dates)
            : job.completed_dates || [];
        const progress = async (date: string) => {
          if (!completed.includes(date)) completed.push(date);
          await this.db.query(
            'UPDATE t_admin_job SET stage=?,completed_dates=?,last_progress_at=UTC_TIMESTAMP(6) WHERE id=?',
            [`已完成 ${date}`, JSON.stringify(completed), job.id],
          );
          const [state] = await this.db.query(
            'SELECT status FROM t_admin_job WHERE id=?',
            [job.id],
          );
          if (['pausing', 'cancelling'].includes(state.status))
            throw new Error('任务已请求停止');
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
        await this.finish(
          job,
          status,
          completed,
          error,
          status === 'success' ? '执行完成' : '执行结束，请查看数据状态',
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
      await this.settleStoppedJobs();
      const [job] = await this.db.query(
        "SELECT *,DATE_FORMAT(start_date,'%Y-%m-%d') startDate,DATE_FORMAT(end_date,'%Y-%m-%d') endDate FROM t_admin_job WHERE status='queued' OR (status='pending' AND active_key IS NOT NULL AND retry_count<5 AND COALESCE(next_retry_at,DATE_ADD(updated_at,INTERVAL 5 MINUTE))<=UTC_TIMESTAMP(6)) ORDER BY (actor_id IS NULL AND mode='refresh') DESC,(mode IN ('breadth','sector','technical','insights','hot')) ASC,(mode='sector') DESC,id LIMIT 1",
      );
      if (!job) return;
      if (job.actor_id !== null) {
        try {
          const user = await this.auth.current(job.actor_id);
          if (!user.permissions.includes('sync:run') || user.mustChangePassword)
            throw new Error('提交者已失去同步权限');
        } catch {
          await this.finish(
            job,
            'failed',
            typeof job.completed_dates === 'string'
              ? JSON.parse(job.completed_dates)
              : job.completed_dates || [],
            '提交者已失去同步权限',
            '执行失败',
          );
          return;
        }
      }
      const completed: string[] =
        typeof job.completed_dates === 'string'
          ? JSON.parse(job.completed_dates)
          : job.completed_dates || [];
      const claim = await this.db.query(
        "UPDATE t_admin_job SET status='running',next_retry_at=NULL,started_at=COALESCE(started_at,UTC_TIMESTAMP(6)),stage=? WHERE id=? AND status IN ('queued','pending')",
        [
          job.mode === 'sector'
            ? '正在补齐同花顺成分和板块日线'
            : '校验并补齐下一批，最多3个交易日',
          job.id,
        ],
      );
      if (!claim.affectedRows) return;
      try {
        let result: SyncBatchResult | undefined;
        if (job.mode === 'sector')
          result = await this.daily.sectorBatch(job.startDate, job.endDate);
        else if (job.mode === 'technical')
          result = await this.daily.technicalBatch(job.startDate, job.endDate);
        else if (job.mode === 'insights' || job.mode === 'hot')
          result = await this.daily.insightBatch(
            job.startDate,
            job.endDate,
            job.mode === 'hot',
          );
        else if (job.mode === 'breadth')
          result = await this.daily.breadthBatch(job.startDate, job.endDate);
        else
          result = await this.daily.marketBatch(
            job.startDate,
            job.endDate,
            job.mode === 'refresh',
            completed,
          );
        if (!result) throw new Error('采集未返回结果，等待重试');
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
        if (result.failures.length || result.retryAt) status = 'pending';
        if (permanent || blocked) status = 'failed';
        const error =
          [
            ...result.failures,
            ...(result.waitingReason ? [result.waitingReason] : []),
            ...(blocked
              ? [`主动删除保护：${result.protectedDates.join('、')}`]
              : []),
          ].join('\n') || null;
        await this.finish(
          job,
          status,
          done,
          error,
          'stage' in result
            ? String(result.stage)
            : `已处理 ${done.length} 日，待补 ${result.remaining} 日`,
          result.failures.length ? undefined : result.retryAt,
        );
      } catch (e) {
        const permanent = permanentSyncError(e);
        await this.finish(
          job,
          permanent ? 'failed' : 'pending',
          completed,
          String(redact(e.message)).slice(0, 2000),
          permanent ? '执行失败' : '等待重试',
        );
      }
    });
  }
}
