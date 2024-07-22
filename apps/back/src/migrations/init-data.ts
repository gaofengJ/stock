import * as fs from 'fs';
import * as path from 'path';

import { MigrationInterface, QueryRunner } from 'typeorm';

const sql = fs.readFileSync(path.join(__dirname, '../sql/stock.sql'), 'utf8');

export class InitData implements MigrationInterface {
  name = 'InitData';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(sql);
  }

  public async down(): Promise<void> {}
}

// const migrationIns = new InitData();
// migrationIns.up();
