import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { CurrentUser } from '../auth/auth.service';

@Injectable()
export class FeedbackService {
  constructor(private db: DataSource) {}

  private isAdmin(user: CurrentUser) {
    return user.roles.some((role) => role.code === 'admin');
  }

  private async visible(id: number, user: CurrentUser, m = this.db.manager) {
    const [item] = await m.query(
      `SELECT f.id,f.user_id userId,f.content,f.created_at createdAt,f.updated_at updatedAt,
        COALESCE(NULLIF(u.nickname,''),u.username) author
       FROM t_feedback f JOIN t_user u ON u.id=f.user_id
       WHERE f.id=?${this.isAdmin(user) ? '' : ' AND f.user_id=?'}`,
      this.isAdmin(user) ? [id] : [id, user.id],
    );
    // Use the same response for a missing thread and another user's thread.
    if (!item) throw new NotFoundException('反馈不存在');
    return item;
  }

  async list(user: CurrentUser, page: number) {
    const where = this.isAdmin(user) ? '' : ' WHERE f.user_id=?';
    const params = this.isAdmin(user) ? [] : [user.id];
    const [count] = await this.db.query(
      `SELECT COUNT(*) total FROM t_feedback f${where}`,
      params,
    );
    const items = await this.db.query(
      `SELECT f.id,f.content,f.created_at createdAt,f.updated_at updatedAt,
        COALESCE(NULLIF(u.nickname,''),u.username) author
       FROM t_feedback f JOIN t_user u ON u.id=f.user_id${where}
       ORDER BY f.updated_at DESC,f.id DESC LIMIT 20 OFFSET ?`,
      [...params, (page - 1) * 20],
    );
    return { items, total: Number(count.total) };
  }

  async create(user: CurrentUser, content: string) {
    const result = await this.db.query(
      'INSERT INTO t_feedback(user_id,content) VALUES(?,?)',
      [user.id, content],
    );
    return { id: result.insertId };
  }

  async detail(id: number, user: CurrentUser) {
    const item = await this.visible(id, user);
    const replies = await this.db.query(
      `SELECT r.id,r.content,r.is_admin isAdmin,r.created_at createdAt,
        COALESCE(NULLIF(u.nickname,''),u.username) author
       FROM t_feedback_reply r JOIN t_user u ON u.id=r.user_id
       WHERE r.feedback_id=? ORDER BY r.id`,
      [id],
    );
    return { ...item, replies };
  }

  async reply(id: number, user: CurrentUser, content: string) {
    await this.db.transaction(async (m: EntityManager) => {
      await this.visible(id, user, m);
      await m.query(
        'INSERT INTO t_feedback_reply(feedback_id,user_id,content,is_admin) VALUES(?,?,?,?)',
        [id, user.id, content, this.isAdmin(user)],
      );
      await m.query(
        'UPDATE t_feedback SET updated_at=UTC_TIMESTAMP(3) WHERE id=?',
        [id],
      );
    });
    return { ok: true };
  }
}
