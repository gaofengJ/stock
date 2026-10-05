import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { createHash } from 'crypto';

/** Cache only undecorated candidates; sector membership is checked on every request. */
@Injectable()
export class StrategyCacheService {
  private entries = new Map<
    string,
    { expires: number; promise: Promise<any[]> }
  >();

  constructor(private db: DataSource) {}

  async read(date: string, parameters: object, loader: () => Promise<any[]>) {
    // Read publication and deletion versions every time, including failed/running
    // sources. A repaired or protected day cannot reuse a previous result.
    const versions = await this.db.query(
      `SELECT CAST(CONCAT('run:',task,':',trade_date) AS BINARY) k, CAST(CONCAT(status,':',updated_at) AS BINARY) v FROM t_sync_run
       WHERE task IN ('daily','strategy-factor') AND trade_date BETWEEN DATE_SUB(?, INTERVAL 18 MONTH) AND ?
       UNION ALL SELECT CAST(CONCAT('policy:',trade_date) AS BINARY),CAST(reason AS BINARY) FROM t_sync_day_policy WHERE trade_date<=?
       UNION ALL SELECT CAST(CONCAT('identity:',snapshot_key) AS BINARY),CAST(CONCAT(as_of,':',updated_at) AS BINARY) FROM t_source_stock_history
       UNION ALL SELECT CAST(CONCAT('factor:',trade_date) AS BINARY),CAST(updated_at AS BINARY) FROM t_source_strategy_factor
       WHERE trade_date BETWEEN DATE_SUB(?, INTERVAL 18 MONTH) AND ? UNION ALL SELECT CAST(CONCAT('alias:',old_code) AS BINARY),CAST(CONCAT(new_code,':',updated_at) AS BINARY) FROM t_source_bse_mapping ORDER BY k`,
      [date, date, date, date, date],
    );
    const revision = createHash('sha256')
      .update(JSON.stringify(versions))
      .digest('hex');
    const key = JSON.stringify([date, parameters, revision]);
    const now = Date.now();
    this.entries.forEach((entry, id) => {
      if (entry.expires <= now) this.entries.delete(id);
    });
    let entry = this.entries.get(key);
    if (!entry) {
      // Bound candidate memory even when many different parameter sets are used.
      if (this.entries.size >= 32)
        this.entries.delete(this.entries.keys().next().value!);
      entry = { expires: Infinity, promise: loader() };
      this.entries.set(key, entry);
      const current = entry;
      current.promise
        .then(() => {
          current.expires = Date.now() + 30 * 60_000;
        })
        .catch(() => {
          if (this.entries.get(key) === current) this.entries.delete(key);
        });
    }
    // Decorators must not mutate the shared result or affect another caller.
    return (await entry.promise).map((row) => ({ ...row }));
  }
}
