import { MigrationInterface, QueryRunner } from 'typeorm';

// Snapshot of the retired subscriptions, independent of future catalog edits.
export const RETIRED_RESEARCH_CODES = [
  'em-strategy',
  'em-macro',
  'em-broker',
  'em-industry',
  'em-stock',
] as const;

export class NewsDisplayPolicy1790835600000 implements MigrationInterface {
  name = 'NewsDisplayPolicy1790835600000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(
      'UPDATE t_news_source SET enabled=0,next_attempt=NULL WHERE source IN (?,?,?,?,?)',
      [...RETIRED_RESEARCH_CODES],
    );
    await q.query(
      "UPDATE t_news_source SET enabled=1,interval_seconds=300,next_attempt=NULL,consecutive_failures=0 WHERE source='bloomberg'",
    );
  }

  down(): Promise<void> {
    // Keep retired subscriptions disabled; prior administrator choices are unknown.
    // This migration changes no schema or stored news/favorites.
    return Promise.resolve();
  }
}
