import { Injectable } from '@nestjs/common';
import { TushareService } from '@/shared/tushare/tushare.service';
import { ResearchRow } from './research-rules';

export interface ResearchSource {
  source: string;
  state: 'ready' | 'error';
  message: string | null;
  fetchedAt: string;
  rows: ResearchRow[];
}

/** No database dependency or stored responses: only coalesce simultaneous reads. */
@Injectable()
export class ResearchSourceService {
  private pending = new Map<string, Promise<ResearchSource>>();

  private active = 0;

  private nextStart = 0;

  constructor(private tushare: TushareService) {}

  read(
    source: string,
    params: Record<string, unknown>,
    fields: string,
    pageSize: number,
  ): Promise<ResearchSource> {
    const key = JSON.stringify([source, params, fields]);
    const existing = this.pending.get(key);
    if (existing) return existing;
    const result = this.fetch(source, params, fields, pageSize).finally(() =>
      this.pending.delete(key),
    );
    this.pending.set(key, result);
    return result;
  }

  private async fetch(
    source: string,
    params: Record<string, unknown>,
    fields: string,
    pageSize: number,
  ): Promise<ResearchSource> {
    const deadline = Date.now() + 11500;
    let acquired = false;
    try {
      if (this.pending.size >= 24) throw new Error('来源查询繁忙，请稍后重试');
      while (this.active >= 3) {
        if (Date.now() >= deadline - 500)
          throw new Error('来源查询繁忙，请稍后重试');
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => {
          setTimeout(resolve, 60);
        });
      }
      this.active += 1;
      acquired = true;
      const wait = Math.max(0, this.nextStart - Date.now());
      this.nextStart = Date.now() + wait + 350;
      if (wait)
        await new Promise((resolve) => {
          setTimeout(resolve, wait);
        });
      const data = await this.tushare.queryLiveData(
        source,
        params,
        fields,
        pageSize,
        deadline,
      );
      const required = fields.split(',');
      if (required.some((field) => !data.fields.includes(field)))
        throw new Error('来源缺少必要字段，资料未完整取得');
      const rows = data.items.map((values) => {
        if (!Array.isArray(values) || values.length !== data.fields.length)
          throw new Error('来源行结构异常');
        return Object.fromEntries(
          data.fields.map((field, index) => [field, values[index]]),
        );
      });
      return {
        source,
        state: 'ready',
        message: null,
        fetchedAt: new Date().toISOString(),
        rows,
      };
    } catch (error) {
      const message = String(error?.message || '');
      let safeMessage = '数据源暂时无法获取，请重试';
      if (/分页|完整|结构|字段|范围/.test(message))
        safeMessage = '来源资料未完整取得，请重试或缩小范围';
      if (/繁忙/.test(message)) safeMessage = '来源查询繁忙，请稍后重试';
      if (/频次|频率|每分钟|每天|每日|429/.test(message))
        safeMessage = '数据源调用额度或频次受限，请稍后重试';
      if (/权限|积分/.test(message))
        safeMessage = '当前数据源权限不足，请联系管理员核实';
      return {
        source,
        state: 'error',
        message: safeMessage,
        fetchedAt: new Date().toISOString(),
        rows: [],
      };
    } finally {
      if (acquired) this.active -= 1;
    }
  }
}
