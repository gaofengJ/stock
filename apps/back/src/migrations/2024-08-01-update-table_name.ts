import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateTableName20240801 implements MigrationInterface {
  name = 'UpdateTableName20240801';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`sys_dict_item\` CHANGE \`update_by\` \`update_by\` int NULL COMMENT '更新者'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`sys_dict_item\` CHANGE \`update_by\` \`update_by\` int NOT NULL COMMENT '更新者'`,
    );
  }
}
