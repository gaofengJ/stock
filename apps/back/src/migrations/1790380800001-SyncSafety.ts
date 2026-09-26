import { MigrationInterface, QueryRunner } from 'typeorm';

export class SyncSafety1790380800001 implements MigrationInterface {
  transaction = false;

  async up(runner: QueryRunner) {
    await runner.query(
      'CREATE TABLE IF NOT EXISTS t_sync_day_policy (trade_date DATE NOT NULL PRIMARY KEY, reason VARCHAR(64) NOT NULL) ENGINE=InnoDB',
    );
  }

  async down() {
    // 主动删除策略不可随代码回滚丢失。
  }
}
