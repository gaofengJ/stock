import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { CurrentUser } from '../auth/auth.service';

// A user's own messages never create a notification. Missing read rows also
// surface existing feedback to administrators the first time they use the feature.
const unreadCondition = `((seen.user_id IS NULL AND f.user_id<>?) OR EXISTS(
  SELECT 1 FROM t_feedback_reply r WHERE r.feedback_id=f.id
  AND r.id>COALESCE(seen.last_reply_id,0) AND r.user_id<>?
))`;

interface FeedbackListItem {
  id: number;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  author: string;
  unread: number;
}

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
    const items: FeedbackListItem[] = await this.db.query(
      `SELECT f.id,f.content,f.created_at createdAt,f.updated_at updatedAt,
        COALESCE(NULLIF(u.nickname,''),u.username) author, ${unreadCondition} unread
       FROM t_feedback f JOIN t_user u ON u.id=f.user_id
       LEFT JOIN t_feedback_read seen ON seen.feedback_id=f.id AND seen.user_id=?${where}
       ORDER BY f.updated_at DESC,f.id DESC LIMIT 20 OFFSET ?`,
      [user.id, user.id, user.id, ...params, (page - 1) * 20],
    );
    return {
      items: items.map((item) => ({ ...item, unread: !!Number(item.unread) })),
      total: Number(count.total),
    };
  }

  async unread(user: CurrentUser) {
    const [result] = await this.db.query(
      `SELECT EXISTS(SELECT 1 FROM t_feedback f
       LEFT JOIN t_feedback_read seen ON seen.feedback_id=f.id AND seen.user_id=?
       WHERE ${
         this.isAdmin(user) ? '' : 'f.user_id=? AND '
       }${unreadCondition}) unread`,
      this.isAdmin(user)
        ? [user.id, user.id, user.id]
        : [user.id, user.id, user.id, user.id],
    );
    return { unread: !!Number(result.unread) };
  }

  async markRead(id: number, user: CurrentUser, throughReplyId: number) {
    await this.visible(id, user);
    if (throughReplyId) {
      const [reply] = await this.db.query(
        'SELECT id FROM t_feedback_reply WHERE feedback_id=? AND id=?',
        [id, throughReplyId],
      );
      if (!reply) throw new NotFoundException('回复不存在');
    }
    // Only acknowledge the displayed snapshot, preserving concurrent new replies
    // and never letting an older tab move the read cursor backwards.
    await this.db.query(
      `INSERT INTO t_feedback_read(user_id,feedback_id,last_reply_id) VALUES(?,?,?)
       ON DUPLICATE KEY UPDATE last_reply_id=GREATEST(last_reply_id,VALUES(last_reply_id))`,
      [user.id, id, throughReplyId],
    );
    return { ok: true };
  }

  async create(user: CurrentUser, content: string) {
    const result = await this.db.query(
      'INSERT INTO t_feedback(user_id,content,created_at,updated_at) VALUES(?,?,UTC_TIMESTAMP(3),UTC_TIMESTAMP(3))',
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
    return { ...item, replies, throughReplyId: replies.at(-1)?.id || 0 };
  }

  async reply(id: number, user: CurrentUser, content: string) {
    await this.db.transaction(async (m: EntityManager) => {
      await this.visible(id, user, m);
      await m.query(
        'INSERT INTO t_feedback_reply(feedback_id,user_id,content,is_admin,created_at) VALUES(?,?,?,?,UTC_TIMESTAMP(3))',
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
