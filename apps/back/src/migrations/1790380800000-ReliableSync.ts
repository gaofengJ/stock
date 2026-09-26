import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

const uniqueKeys = [
  {
    table: 't_source_daily',
    index: 'uq_daily_code_date',
    columns: ['ts_code', 'trade_date'],
  },
  {
    table: 't_source_limit',
    index: 'uq_limit_code_date_type',
    columns: ['ts_code', 'trade_date', 'limit'],
  },
  {
    table: 't_processed_senti',
    index: 'uq_senti_date',
    columns: ['trade_date'],
  },
];

export class ReliableSync1790380800000 implements MigrationInterface {
  // MySQL DDL 隐式提交；每张表的数据备份与去重另开一个事务。
  transaction = false;

  async up(runner: QueryRunner): Promise<void> {
    // 每张表的 DDL 与备份必须顺序执行。
    // eslint-disable-next-line no-restricted-syntax
    for (const key of uniqueKeys) {
      // eslint-disable-next-line no-await-in-loop
      const table = await runner.getTable(key.table);
      if (!table) throw new Error(`缺少 ${key.table}，请先初始化原有业务表`);
      // eslint-disable-next-line no-continue
      if (table.indices.some((index) => index.name === key.index)) continue;
      const backup = `${key.table}_sync_backup_20260926`;
      // 重跑迁移时保留第一次备份，不覆盖历史记录。
      // eslint-disable-next-line no-await-in-loop
      await runner.query(
        `CREATE TABLE IF NOT EXISTS \`${backup}\` LIKE \`${key.table}\``,
      );
      const join = key.columns
        .map((column) => `old.\`${column}\` <=> duplicates.\`${column}\``)
        .join(' AND ');
      const columns = key.columns.map((column) => `\`${column}\``).join(', ');
      const duplicates = `(SELECT ${columns}, MAX(id) AS keep_id FROM \`${key.table}\` GROUP BY ${columns} HAVING COUNT(*) > 1) duplicates`;
      // eslint-disable-next-line no-await-in-loop
      await runner.startTransaction();
      try {
        // eslint-disable-next-line no-await-in-loop
        await runner.query(
          `INSERT IGNORE INTO \`${backup}\` SELECT old.* FROM \`${key.table}\` old JOIN ${duplicates} ON ${join} AND old.id < duplicates.keep_id`,
        );
        // 同一业务键保留 id 最大的记录；删除的行完整存放在备份表。
        // eslint-disable-next-line no-await-in-loop
        await runner.query(
          `DELETE old FROM \`${key.table}\` old JOIN ${duplicates} ON ${join} AND old.id < duplicates.keep_id`,
        );
        // eslint-disable-next-line no-await-in-loop
        await runner.commitTransaction();
      } catch (error) {
        // eslint-disable-next-line no-await-in-loop
        await runner.rollbackTransaction();
        throw error;
      }
      // eslint-disable-next-line no-await-in-loop
      await runner.createIndex(
        key.table,
        new TableIndex({
          name: key.index,
          columnNames: key.columns,
          isUnique: true,
        }),
      );
    }
    if (!(await runner.hasTable('t_sync_run'))) {
      await runner.createTable(
        new Table({
          name: 't_sync_run',
          engine: 'InnoDB',
          columns: [
            {
              name: 'id',
              type: 'int',
              isPrimary: true,
              isGenerated: true,
              generationStrategy: 'increment',
            },
            {
              name: 'created_at',
              type: 'datetime',
              precision: 6,
              default: 'CURRENT_TIMESTAMP(6)',
            },
            {
              name: 'updated_at',
              type: 'datetime',
              precision: 6,
              default: 'CURRENT_TIMESTAMP(6)',
              onUpdate: 'CURRENT_TIMESTAMP(6)',
            },
            { name: 'task', type: 'varchar', length: '32' },
            { name: 'trade_date', type: 'date' },
            { name: 'status', type: 'varchar', length: '16' },
            { name: 'attempts', type: 'int', default: 0 },
            { name: 'daily_count', type: 'int', default: 0 },
            { name: 'limit_count', type: 'int', default: 0 },
            { name: 'senti_count', type: 'int', default: 0 },
            { name: 'error', type: 'text', isNullable: true },
          ],
          indices: [
            {
              name: 'uq_sync_task_date',
              columnNames: ['task', 'trade_date'],
              isUnique: true,
            },
          ],
        }),
      );
    }
  }

  async down(runner: QueryRunner): Promise<void> {
    // eslint-disable-next-line no-restricted-syntax
    for (const key of uniqueKeys) {
      // eslint-disable-next-line no-await-in-loop
      const table = await runner.getTable(key.table);
      if (table?.indices.some((index) => index.name === key.index)) {
        // eslint-disable-next-line no-await-in-loop
        await runner.dropIndex(key.table, key.index);
      }
    }
    // 保留任务记录和备份表；回滚代码时不得自动复原已被后续同步修正的旧数据。
  }
}
