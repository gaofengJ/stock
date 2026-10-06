/* eslint-disable no-restricted-syntax, no-await-in-loop -- Ordered database operations and bounded streams must execute sequentially. */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { FastifyReply, FastifyRequest } from 'fastify';
import { PERMISSIONS, DEFAULT_PERMISSIONS } from './permissions';
import { checkPassword, hashPassword } from './password';
import {
  ActivityQueryDto,
  LoginDto,
  ProfileDto,
  RegisterDto,
  RoleDto,
  UserQueryDto,
  UserUpdateDto,
} from './auth.dto';
import { redact } from './redact';
import { randomAvatar, AVATARS } from './avatar';

export const COOKIE = 'stock_session';
export const TRIAL_COOKIE = 'stock_trial';
export const digest = (value: string) =>
  createHash('sha256').update(value).digest('hex');
export interface CurrentUser {
  id: number;
  username: string;
  nickname: string;
  avatar: string;
  mustChangePassword: boolean;
  roles: { id: number; code: string; name: string }[];
  permissions: string[];
  catalog: typeof PERMISSIONS;
}
export type AuthRequest = FastifyRequest & {
  authUser?: CurrentUser;
  authSession?: any;
};
const fail = () => new UnauthorizedException('账号或密码错误');
const roleRevision = (role: {
  code: string;
  name: string;
  description: string;
  builtin: number | boolean;
  permissions: string[];
  users: { id: number }[];
}) =>
  digest(
    JSON.stringify([
      role.code,
      role.name,
      role.description || '',
      !!role.builtin,
      [...new Set(role.permissions)].sort(),
      [...new Set(role.users.map((u) => u.id))].sort((a, b) => a - b),
    ]),
  );

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(readonly db: DataSource) {}

  async onModuleInit() {
    try {
      const rows = await this.db.query(
        "SELECT name FROM t_auth_meta WHERE name='bootstrap-v1'",
      );
      if (!rows.length) throw new Error();
    } catch {
      throw new Error(
        '账户表未初始化，请先运行 migration:run（不要启用 DB_SYNCHRONIZE）',
      );
    }
  }

  cookieOptions() {
    return {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
    };
  }

  async audit(
    actor: Pick<CurrentUser, 'id' | 'username'> | null,
    action: string,
    target: string | number | null,
    result = 'success',
    detail: unknown = undefined,
    manager: EntityManager = this.db.manager,
  ) {
    await manager.query(
      'INSERT INTO t_auth_audit(actor_id,actor_name,action,target,result,detail,created_at,updated_at) VALUES (?,?,?,?,?,?,UTC_TIMESTAMP(6),UTC_TIMESTAMP(6))',
      [
        actor?.id || null,
        actor?.username || 'system',
        action,
        target === null ? null : String(target),
        result,
        detail === undefined ? null : JSON.stringify(redact(detail)),
      ],
    );
  }

  async current(id: number, m = this.db.manager): Promise<CurrentUser> {
    const [u] = await m.query(
      'SELECT id,username,nickname,avatar,must_change_password,is_active FROM t_user WHERE id=?',
      [id],
    );
    if (!u || !u.is_active)
      throw new UnauthorizedException('账号已失效，请重新登录');
    const roles = await m.query(
      'SELECT r.id,r.code,r.role_name name FROM t_role r JOIN t_user_role ur ON ur.role_id=r.id WHERE ur.user_id=?',
      [id],
    );
    const known = new Set(PERMISSIONS.map((p) => p.code));
    const permissions = await m.query(
      'SELECT DISTINCT p.code FROM t_permission p JOIN t_role_permission rp ON rp.permission_id=p.id JOIN t_user_role ur ON ur.role_id=rp.role_id WHERE ur.user_id=?',
      [id],
    );
    return {
      id: u.id,
      username: u.username,
      nickname: u.nickname,
      avatar: u.avatar,
      mustChangePassword: !!u.must_change_password,
      roles,
      permissions: permissions
        .map((p: { code: string }) => p.code)
        .filter((p: string) => known.has(p)),
      catalog: PERMISSIONS,
    };
  }

  async session(req: FastifyRequest) {
    const token = req.cookies?.[COOKIE];
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    const idleHours = Number(process.env.AUTH_IDLE_HOURS || 24);
    const [s] = await this.db.query(
      'SELECT id,user_id,csrf_hash FROM t_auth_session WHERE token_hash=? AND revoked_at IS NULL AND expires_at>UTC_TIMESTAMP(6) AND last_seen_at>DATE_SUB(UTC_TIMESTAMP(6),INTERVAL ? HOUR)',
      [digest(token), idleHours],
    );
    if (s)
      await this.db.query(
        'UPDATE t_auth_session SET last_seen_at=UTC_TIMESTAMP(6) WHERE id=? AND last_seen_at<DATE_SUB(UTC_TIMESTAMP(6),INTERVAL 1 MINUTE)',
        [s.id],
      );
    return s || null;
  }

  async issue(
    reply: FastifyReply,
    userId: number | null,
    manager: EntityManager = this.db.manager,
  ) {
    const token = randomBytes(32).toString('hex');
    const csrf = digest(`csrf:${token}`);
    const seconds = userId
      ? Number(process.env.AUTH_MAX_DAYS || 7) * 86400
      : 3600;
    await manager.query(
      'INSERT INTO t_auth_session(user_id,token_hash,csrf_hash,last_seen_at,expires_at) VALUES (?,?,?,UTC_TIMESTAMP(6),DATE_ADD(UTC_TIMESTAMP(6),INTERVAL ? SECOND))',
      [userId, digest(token), digest(csrf), seconds],
    );
    reply.setCookie(COOKIE, token, {
      ...this.cookieOptions(),
      maxAge: seconds,
    });
    return csrf;
  }

  async csrf(req: FastifyRequest, reply: FastifyReply) {
    const s = await this.session(req);
    reply.header('Cache-Control', 'no-store');
    if (!s) return { csrfToken: await this.issue(reply, null) };
    const token = digest(`csrf:${req.cookies[COOKIE]}`);
    return { csrfToken: token };
  }

  // A separate long-lived browser marker keeps logout and CSRF rotation from
  // restarting the trial. Expired/cleaned-up rows remain expired for that marker.
  async trial(req: FastifyRequest, reply?: FastifyReply, start = false) {
    let token = req.cookies?.[TRIAL_COOKIE];
    if (!token && start && reply) {
      token = randomBytes(32).toString('hex');
      await this.db.query(
        'INSERT INTO t_auth_session(user_id,token_hash,csrf_hash,last_seen_at,expires_at) VALUES (NULL,?,?,UTC_TIMESTAMP(6),DATE_ADD(UTC_TIMESTAMP(6),INTERVAL 5 MINUTE))',
        [digest(token), digest(`trial:${token}`)],
      );
      reply.setCookie(TRIAL_COOKIE, token, {
        ...this.cookieOptions(),
        maxAge: 365 * 86400,
      });
    }
    if (!token) return null;
    if (!/^[a-f0-9]{64}$/.test(token)) return { remainingMs: 0 };
    const [row] = await this.db.query(
      'SELECT GREATEST(0,TIMESTAMPDIFF(MICROSECOND,UTC_TIMESTAMP(6),expires_at) DIV 1000) remainingMs FROM t_auth_session WHERE token_hash=? AND csrf_hash=? AND user_id IS NULL AND revoked_at IS NULL',
      [digest(token), digest(`trial:${token}`)],
    );
    return { remainingMs: Math.min(300000, Number(row?.remainingMs || 0)) };
  }

  async access(req: AuthRequest, reply: FastifyReply, start: boolean) {
    if (req.authSession?.user_id) {
      try {
        return {
          user: await this.current(req.authSession.user_id),
          trial: null,
        };
      } catch (error) {
        if (error instanceof UnauthorizedException)
          return { user: null, trial: null };
        throw error;
      }
    }
    // A stale signed-in session must return to login, rather than silently
    // downgrading to a fresh guest trial after revocation or account disablement.
    const trial = await this.trial(
      req,
      reply,
      start && (!req.cookies?.[COOKIE] || !!req.authSession),
    );
    const viewer =
      trial && trial.remainingMs > 0
        ? {
            id: 0,
            username: 'guest',
            nickname: '游客',
            guest: true,
            mustChangePassword: false,
            roles: [],
            permissions: DEFAULT_PERMISSIONS,
            catalog: PERMISSIONS.filter((p) =>
              DEFAULT_PERMISSIONS.includes(p.code),
            ),
          }
        : null;
    return { user: viewer, trial };
  }

  async memberLogin(
    user: CurrentUser,
    manager: EntityManager,
    registered = false,
  ) {
    if (!user.roles.some((role) => role.code === 'admin'))
      await this.audit(
        user,
        'auth.member-login',
        user.id,
        'success',
        { registered },
        manager,
      );
  }

  async loginActivity(actor: CurrentUser, q = new ActivityQueryDto()) {
    if (q.startDate && q.endDate && q.startDate > q.endDate)
      throw new BadRequestException('开始日期不能晚于结束日期');
    // Use one snapshot so concurrent logins cannot disagree with the unread
    // count or fall outside the boundary offered by "mark all read".
    return this.db.transaction('REPEATABLE READ', async (m) => {
      const from = `FROM t_auth_audit a
        LEFT JOIN t_auth_activity_read c ON c.user_id=?
        LEFT JOIN t_auth_activity_item_read r ON r.user_id=? AND r.audit_id=a.id
        LEFT JOIN t_user u ON u.id=a.actor_id`;
      const base =
        "a.action='auth.member-login' AND a.result='success' AND a.created_at>=DATE_SUB(UTC_TIMESTAMP(6),INTERVAL 90 DAY)";
      const unread = '(a.id>COALESCE(c.last_read_id,0) AND r.audit_id IS NULL)';
      const registered =
        "COALESCE(JSON_UNQUOTE(JSON_EXTRACT(a.detail,'$.registered')),'false')='true'";
      const [summary] = await m.query(
        `SELECT COALESCE(MAX(a.id),0) latestId,COALESCE(SUM(${unread}),0) unread ${from} WHERE ${base}`,
        [actor.id, actor.id],
      );
      const filters = [base];
      const args: unknown[] = [actor.id, actor.id];
      if (q.keyword?.trim()) {
        filters.push('(LOCATE(?,a.actor_name)>0 OR LOCATE(?,u.nickname)>0)');
        args.push(q.keyword.trim(), q.keyword.trim());
      }
      if (q.status)
        filters.push(q.status === 'unread' ? unread : `NOT ${unread}`);
      if (q.event)
        filters.push(
          q.event === 'register' ? registered : `NOT (${registered})`,
        );
      // Date filters refer to full calendar days in Asia/Shanghai, not UTC.
      if (q.startDate) {
        filters.push('a.created_at>=?');
        args.push(new Date(`${q.startDate}T00:00:00+08:00`));
      }
      if (q.endDate) {
        filters.push('a.created_at<?');
        args.push(
          new Date(
            new Date(`${q.endDate}T00:00:00+08:00`).getTime() + 86400000,
          ),
        );
      }
      const where = filters.join(' AND ');
      const [count] = await m.query(
        `SELECT COUNT(*) total ${from} WHERE ${where}`,
        args,
      );
      const total = Number(count.total);
      const page = Math.min(q.page, Math.max(1, Math.ceil(total / q.pageSize)));
      const items = await m.query(
        `SELECT a.id,a.actor_name username,u.nickname,${registered} registered,${unread} unread,
          DATE_FORMAT(a.created_at,'%Y-%m-%dT%H:%i:%s.%fZ') createdAt
          ${from} WHERE ${where} ORDER BY a.id DESC LIMIT ? OFFSET ?`,
        [...args, q.pageSize, (page - 1) * q.pageSize],
      );
      return {
        unread: Number(summary.unread),
        latestId: Number(summary.latestId),
        total,
        page,
        pageSize: q.pageSize,
        items: items.map((item: { registered: number; unread: number }) => ({
          ...item,
          registered: !!Number(item.registered),
          unread: !!Number(item.unread),
        })),
      };
    });
  }

  async readLoginActivityItem(actor: CurrentUser, id: number) {
    if (!Number.isInteger(id) || id <= 0 || id > 2147483647)
      throw new BadRequestException('请选择有效的登录记录');
    const result = await this.db.query(
      `INSERT INTO t_auth_activity_item_read(user_id,audit_id)
       SELECT ?,id FROM t_auth_audit WHERE id=? AND action='auth.member-login' AND result='success'
         AND created_at>=DATE_SUB(UTC_TIMESTAMP(6),INTERVAL 90 DAY)
       ON DUPLICATE KEY UPDATE audit_id=VALUES(audit_id)`,
      [actor.id, id],
    );
    // Duplicate writes are idempotent; absence is verified separately because
    // MySQL may report zero affected rows for an unchanged existing marker.
    if (!result.affectedRows) {
      const [existing] = await this.db.query(
        'SELECT audit_id FROM t_auth_activity_item_read WHERE user_id=? AND audit_id=?',
        [actor.id, id],
      );
      if (!existing) throw new NotFoundException('登录记录不存在或已过期');
    }
    return { success: true };
  }

  async readLoginActivity(actor: CurrentUser, throughId: number) {
    // Clamp to a real event; marking a displayed snapshot does not consume
    // events that arrived while the confirmation was open.
    const [row] = await this.db.query(
      "SELECT COALESCE(MAX(id),0) id FROM t_auth_audit WHERE action='auth.member-login' AND result='success' AND id<=?",
      [throughId],
    );
    await this.db.query(
      'INSERT INTO t_auth_activity_read(user_id,last_read_id) VALUES (?,?) ON DUPLICATE KEY UPDATE last_read_id=GREATEST(last_read_id,VALUES(last_read_id))',
      [actor.id, Number(row.id)],
    );
    return { success: true };
  }

  async register(
    dto: RegisterDto,
    actor?: CurrentUser | null,
    req?: AuthRequest,
    reply?: FastifyReply,
  ) {
    if (dto.username === 'mufeng')
      throw new ConflictException('该用户名不可使用，请更换一个用户名');
    const encoded = await hashPassword(dto.password);
    try {
      return await this.db.transaction(async (m) => {
        const result = await m.query(
          'INSERT INTO t_user(username,password,nickname,must_change_password,avatar) VALUES (?,?,?,?,?)',
          [
            dto.username,
            encoded,
            dto.nickname || dto.username,
            actor ? 1 : 0,
            randomAvatar(),
          ],
        );
        await m.query(
          "INSERT INTO t_user_role(user_id,role_id) SELECT ?,id FROM t_role WHERE code='user'",
          [result.insertId],
        );
        await this.audit(
          actor || { id: result.insertId, username: dto.username },
          actor ? 'user.create' : 'auth.register',
          result.insertId,
          'success',
          undefined,
          m,
        );
        if (!actor && req && reply) {
          if (req.authSession)
            await m.query('DELETE FROM t_auth_session WHERE id=?', [
              req.authSession.id,
            ]);
          const csrfToken = await this.issue(reply, result.insertId, m);
          await m.query(
            'UPDATE t_user SET last_login=UTC_TIMESTAMP() WHERE id=?',
            [result.insertId],
          );
          const user = await this.current(result.insertId, m);
          await this.audit(
            user,
            'auth.login',
            user.id,
            'success',
            undefined,
            m,
          );
          await this.memberLogin(user, m, true);
          return { id: result.insertId, user, csrfToken };
        }
        return { id: result.insertId };
      });
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY')
        throw new ConflictException('用户名已被使用，请更换一个用户名');
      throw e;
    }
  }

  async login(dto: LoginDto, req: AuthRequest, reply: FastifyReply) {
    const [found] = await this.db.query(
      'SELECT id,password,is_active FROM t_user WHERE username=?',
      [dto.username],
    );
    // Equalize expensive work for unknown accounts.
    const encoded =
      found?.password ||
      '$argon2id$v=19$m=19456,t=2,p=1$kIjtTzH4gOyGADyr+yz53w$3WEw2t72ImG4Gi+kJ2gxxRKlDivQumsBjEupATzHkvA';
    const valid = await checkPassword(encoded, dto.password);
    if (
      !found ||
      !found.password?.startsWith('$argon2id$') ||
      !valid ||
      !found.is_active
    ) {
      await this.audit(
        { id: found?.id || 0, username: dto.username },
        'auth.login',
        dto.username,
        'failed',
      );
      throw fail();
    }
    return this.db.transaction(async (m) => {
      const [fresh] = await m.query(
        'SELECT password,is_active FROM t_user WHERE id=? FOR UPDATE',
        [found.id],
      );
      if (!fresh?.is_active || fresh.password !== found.password) throw fail();
      if (req.authSession)
        await m.query('DELETE FROM t_auth_session WHERE id=?', [
          req.authSession.id,
        ]);
      const csrfToken = await this.issue(reply, found.id, m);
      await m.query('UPDATE t_user SET last_login=UTC_TIMESTAMP() WHERE id=?', [
        found.id,
      ]);
      const user = await this.current(found.id, m);
      await this.audit(user, 'auth.login', found.id, 'success', undefined, m);
      await this.memberLogin(user, m);
      return { user, csrfToken };
    });
  }

  async logout(req: AuthRequest, reply: FastifyReply) {
    await this.db.query('DELETE FROM t_auth_session WHERE id=?', [
      req.authSession.id,
    ]);
    reply.clearCookie(COOKIE, this.cookieOptions());
    await this.audit(req.authUser!, 'auth.logout', req.authUser!.id);
  }

  async changePassword(
    user: CurrentUser,
    currentPassword: string,
    next: string,
  ) {
    const encoded = await hashPassword(next);
    await this.db.transaction(async (m) => {
      const [row] = await m.query(
        'SELECT password FROM t_user WHERE id=? FOR UPDATE',
        [user.id],
      );
      if (!(await checkPassword(row?.password, currentPassword)))
        throw new BadRequestException('原密码错误');
      await m.query(
        'UPDATE t_user SET password=?,must_change_password=0 WHERE id=?',
        [encoded, user.id],
      );
      await m.query('DELETE FROM t_auth_session WHERE user_id=?', [user.id]);
      await this.audit(user, 'auth.password', user.id, 'success', undefined, m);
    });
  }

  async profile(user: CurrentUser, dto: ProfileDto) {
    const { nickname, avatar } = dto;
    if (nickname === undefined && avatar === undefined)
      throw new BadRequestException('请填写昵称或选择头像');
    if (avatar !== undefined && !AVATARS.includes(avatar))
      throw new BadRequestException('请选择有效的小牛头像');
    return this.db.transaction(async (m) => {
      if (nickname !== undefined)
        await m.query('UPDATE t_user SET nickname=? WHERE id=?', [
          nickname,
          user.id,
        ]);
      if (avatar !== undefined)
        await m.query('UPDATE t_user SET avatar=? WHERE id=?', [
          avatar,
          user.id,
        ]);
      await this.audit(
        user,
        'user.profile',
        user.id,
        'success',
        { nickname, avatar },
        m,
      );
      return this.current(user.id, m);
    });
  }

  async users(q: UserQueryDto) {
    return this.db.transaction('REPEATABLE READ', async (m) => {
      const keyword = q.keyword?.trim() || '';
      const clauses = ['(LOCATE(?,u.username)>0 OR LOCATE(?,u.nickname)>0)'];
      const args: (string | number)[] = [keyword, keyword];
      if (q.active !== undefined) {
        clauses.push('u.is_active=?');
        args.push(q.active);
      }
      if (q.roleId !== undefined) {
        clauses.push(
          'EXISTS (SELECT 1 FROM t_user_role ur WHERE ur.user_id=u.id AND ur.role_id=?)',
        );
        args.push(q.roleId);
      }
      const where = ` WHERE ${clauses.join(' AND ')}`;
      const [{ total }] = await m.query(
        `SELECT COUNT(*) total FROM t_user u${where}`,
        args,
      );
      // This count deliberately ignores list filters and pagination.
      const [{ activeAdminCount }] = await m.query(
        "SELECT COUNT(*) activeAdminCount FROM t_user u WHERE u.is_active=1 AND EXISTS (SELECT 1 FROM t_user_role ur JOIN t_role r ON r.id=ur.role_id WHERE ur.user_id=u.id AND r.code='admin')",
      );
      const page = Math.min(
        q.page,
        Math.max(1, Math.ceil(Number(total) / q.pageSize)),
      );
      const items = await m.query(
        `SELECT u.id,u.username,u.nickname,u.avatar,u.is_active active,u.must_change_password mustChangePassword,u.last_login lastLogin,u.created_at createdAt FROM t_user u${where} ORDER BY u.id DESC LIMIT ? OFFSET ?`,
        [...args, q.pageSize, (page - 1) * q.pageSize],
      );
      const roles = items.length
        ? await m.query(
            'SELECT ur.user_id userId,r.id,r.code,r.role_name name FROM t_role r JOIN t_user_role ur ON r.id=ur.role_id WHERE ur.user_id IN (?) ORDER BY r.id',
            [items.map((u: { id: number }) => u.id)],
          )
        : [];
      return {
        items: items.map((u: { id: number }) => ({
          ...u,
          roles: roles
            .filter((r: { userId: number }) => r.userId === u.id)
            .map((r: { id: number; code: string; name: string }) => ({
              id: r.id,
              code: r.code,
              name: r.name,
            })),
        })),
        total: Number(total),
        page,
        pageSize: q.pageSize,
        activeAdminCount: Number(activeAdminCount),
      };
    });
  }

  async lockAdministration(m: EntityManager) {
    await m.query("SELECT id FROM t_role WHERE code='admin' FOR UPDATE");
  }

  async ensureAdministrator(m: EntityManager) {
    const [{ total }] = await m.query(
      "SELECT COUNT(DISTINCT u.id) total FROM t_user u JOIN t_user_role ur ON u.id=ur.user_id JOIN t_role r ON r.id=ur.role_id WHERE r.code='admin' AND u.is_active=1",
    );
    if (!Number(total)) throw new ConflictException('至少保留一个有效管理员');
  }

  private async administratorActor(
    actor: CurrentUser,
    m: EntityManager,
    permission: string,
  ) {
    // Re-read under the administration lock; a queued request cannot retain revoked authority.
    const current = await this.current(actor.id, m);
    if (current.mustChangePassword || !current.permissions.includes(permission))
      throw new ForbiddenException('管理权限已变更，请刷新页面');
    return current;
  }

  private assertGrantable(actor: CurrentUser, permissions: string[]) {
    if (actor.roles.some((r) => r.code === 'admin')) return;
    if (
      permissions.some(
        (p) =>
          !DEFAULT_PERMISSIONS.includes(p) || !actor.permissions.includes(p),
      )
    )
      throw new ForbiddenException(
        '仅系统管理员可授予管理权限；其他权限不能超出自身范围',
      );
  }

  private async assertManageableUser(
    actor: CurrentUser,
    id: number,
    m: EntityManager,
  ) {
    if (actor.roles.some((r) => r.code === 'admin')) return;
    if (actor.id === id)
      throw new ForbiddenException(
        '不能通过人员管理修改自己的账户，请使用个人设置',
      );
    const roles = await m.query(
      'SELECT r.code,p.code permission FROM t_role r JOIN t_user_role ur ON ur.role_id=r.id LEFT JOIN t_role_permission rp ON rp.role_id=r.id LEFT JOIN t_permission p ON p.id=rp.permission_id WHERE ur.user_id=?',
      [id],
    );
    if (roles.some((r: any) => r.code === 'admin'))
      throw new ForbiddenException('仅系统管理员可管理管理员账户');
    this.assertGrantable(
      actor,
      roles.map((r: any) => r.permission).filter(Boolean),
    );
  }

  private async assertManageableRole(
    actor: CurrentUser,
    id: number,
    m: EntityManager,
  ) {
    if (actor.roles.some((r) => r.code === 'admin')) return;
    if (actor.roles.some((r) => r.id === id))
      throw new ForbiddenException('不能修改自己所属角色的权限');
    const rows = await m.query(
      'SELECT p.code FROM t_permission p JOIN t_role_permission rp ON p.id=rp.permission_id WHERE rp.role_id=?',
      [id],
    );
    this.assertGrantable(
      actor,
      rows.map((p: any) => p.code),
    );
  }

  async updateUser(actor: CurrentUser, id: number, dto: UserUpdateDto) {
    await this.db.transaction(async (m) => {
      await this.lockAdministration(m);
      const current = await this.administratorActor(actor, m, 'users:manage');
      const [user] = await m.query(
        'SELECT id FROM t_user WHERE id=? FOR UPDATE',
        [id],
      );
      if (!user) throw new NotFoundException('用户不存在');
      await this.assertManageableUser(current, id, m);
      if (dto.nickname !== undefined)
        await m.query('UPDATE t_user SET nickname=? WHERE id=?', [
          dto.nickname,
          id,
        ]);
      if (dto.active !== undefined) {
        await m.query('UPDATE t_user SET is_active=? WHERE id=?', [
          dto.active ? 1 : 0,
          id,
        ]);
        if (!dto.active)
          await m.query('DELETE FROM t_auth_session WHERE user_id=?', [id]);
      }
      if (dto.roleIds) {
        for (const role of dto.roleIds) {
          const [r] = await m.query('SELECT code FROM t_role WHERE id=?', [
            role,
          ]);
          if (!r) throw new BadRequestException('角色不存在');
          if (
            r.code === 'admin' &&
            !current.roles.some((x) => x.code === 'admin')
          )
            throw new ForbiddenException('仅系统管理员可分配管理员角色');
          const permissions = await m.query(
            'SELECT p.code FROM t_permission p JOIN t_role_permission rp ON p.id=rp.permission_id WHERE rp.role_id=?',
            [role],
          );
          this.assertGrantable(
            current,
            permissions.map((p: any) => p.code),
          );
        }
        await m.query('DELETE FROM t_user_role WHERE user_id=?', [id]);
        for (const role of dto.roleIds)
          await m.query(
            'INSERT INTO t_user_role(user_id,role_id) VALUES (?,?)',
            [id, role],
          );
      }
      await this.ensureAdministrator(m);
      await this.audit(actor, 'user.update', id, 'success', dto, m);
    });
  }

  async resetPassword(actor: CurrentUser, id: number, password: string) {
    const encoded = await hashPassword(password);
    await this.db.transaction(async (m) => {
      await this.lockAdministration(m);
      const current = await this.administratorActor(actor, m, 'users:manage');
      const [u] = await m.query('SELECT id FROM t_user WHERE id=? FOR UPDATE', [
        id,
      ]);
      if (!u) throw new NotFoundException('用户不存在');
      await this.assertManageableUser(current, id, m);
      await m.query(
        'UPDATE t_user SET password=?,must_change_password=1 WHERE id=?',
        [encoded, id],
      );
      await m.query('DELETE FROM t_auth_session WHERE user_id=?', [id]);
      await this.audit(
        actor,
        'user.reset-password',
        id,
        'success',
        undefined,
        m,
      );
    });
  }

  async roles() {
    return this.db.transaction('REPEATABLE READ', async (m) => {
      const rows = await m.query(
        'SELECT id,code,role_name name,`desc` description,builtin FROM t_role ORDER BY id',
      );
      const permissions = await m.query(
        'SELECT DISTINCT rp.role_id roleId,p.code FROM t_permission p JOIN t_role_permission rp ON p.id=rp.permission_id ORDER BY p.code',
      );
      const users = await m.query(
        'SELECT DISTINCT ur.role_id roleId,u.id,u.username,u.nickname,u.avatar,u.is_active active FROM t_user u JOIN t_user_role ur ON u.id=ur.user_id ORDER BY u.id',
      );
      return rows.map((r: any) => {
        const role = {
          ...r,
          permissions: permissions
            .filter((p: { roleId: number }) => p.roleId === r.id)
            .map((p: { code: string }) => p.code),
          users: users
            .filter((u: { roleId: number }) => u.roleId === r.id)
            .map((u: any) => ({
              id: u.id,
              username: u.username,
              nickname: u.nickname,
              avatar: u.avatar,
              active: !!u.active,
            })),
        };
        return { ...role, revision: roleRevision(role) };
      });
    });
  }

  async saveRole(
    actor: CurrentUser,
    id: number | null,
    dto: RoleDto,
    expectedRevision?: string,
  ) {
    const known = new Set(PERMISSIONS.map((p) => p.code));
    if (dto.permissions.some((p) => !known.has(p)))
      throw new BadRequestException('未知权限');
    try {
      return await this.db.transaction(async (m) => {
        await this.lockAdministration(m);
        const current = await this.administratorActor(actor, m, 'roles:manage');
        this.assertGrantable(current, dto.permissions);
        if (id) {
          await this.assertManageableRole(current, id, m);
          const [r] = await m.query(
            'SELECT code,role_name name,`desc` description,builtin FROM t_role WHERE id=? FOR UPDATE',
            [id],
          );
          if (!r) throw new NotFoundException('角色不存在');
          if (['admin', 'user'].includes(dto.code) && dto.code !== r.code)
            throw new BadRequestException('保留的角色编码');
          if (r.code === 'admin')
            throw new ForbiddenException('系统管理员角色不可编辑');
          if (
            r.code === 'user' &&
            dto.permissions.some((p) => !DEFAULT_PERMISSIONS.includes(p))
          )
            throw new ForbiddenException('普通用户角色仅可配置业务查看权限');
          if (r.builtin && dto.code !== r.code)
            throw new ForbiddenException('内置角色编码不可修改');
          if (expectedRevision === undefined)
            throw new BadRequestException('角色版本缺失，请重新加载后编辑');
          {
            const permissions = (
              await m.query(
                'SELECT p.code FROM t_permission p JOIN t_role_permission rp ON p.id=rp.permission_id WHERE rp.role_id=?',
                [id],
              )
            ).map((p: { code: string }) => p.code);
            const users = await m.query(
              'SELECT DISTINCT u.id FROM t_user u JOIN t_user_role ur ON u.id=ur.user_id WHERE ur.role_id=?',
              [id],
            );
            if (roleRevision({ ...r, permissions, users }) !== expectedRevision)
              throw new ConflictException('角色已变更，请重新加载后核对再保存');
          }
          await m.query(
            'UPDATE t_role SET role_name=?,`desc`=?,code=? WHERE id=?',
            [dto.name, dto.description || '', dto.code, id],
          );
        } else {
          if (['admin', 'user'].includes(dto.code))
            throw new BadRequestException('保留的角色编码');
          const ret = await m.query(
            'INSERT INTO t_role(code,role_name,`desc`) VALUES (?,?,?)',
            [dto.code, dto.name, dto.description || ''],
          );
          // eslint-disable-next-line no-param-reassign -- Continue the same transaction with the newly allocated role ID.
          id = ret.insertId;
        }
        await m.query('DELETE FROM t_role_permission WHERE role_id=?', [id]);
        for (const p of dto.permissions)
          await m.query(
            'INSERT INTO t_role_permission(role_id,permission_id) SELECT ?,id FROM t_permission WHERE code=?',
            [id, p],
          );
        await this.audit(actor, 'role.save', id, 'success', dto, m);
        return { id };
      });
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY')
        throw new ConflictException('角色名称或编码已存在');
      throw e;
    }
  }

  async deleteRole(actor: CurrentUser, id: number) {
    await this.db.transaction(async (m) => {
      await this.lockAdministration(m);
      const current = await this.administratorActor(actor, m, 'roles:manage');
      await this.assertManageableRole(current, id, m);
      const [r] = await m.query(
        'SELECT builtin FROM t_role WHERE id=? FOR UPDATE',
        [id],
      );
      if (!r) throw new NotFoundException('角色不存在');
      if (r.builtin) throw new ForbiddenException('内置角色不可删除');
      if (
        (
          await m.query('SELECT id FROM t_user_role WHERE role_id=? LIMIT 1', [
            id,
          ])
        ).length
      )
        throw new ConflictException('角色仍有关联用户');
      await m.query('DELETE FROM t_role_permission WHERE role_id=?', [id]);
      await m.query('DELETE FROM t_role WHERE id=?', [id]);
      await this.audit(actor, 'role.delete', id, 'success', undefined, m);
    });
  }

  @Cron('0 15 3 * * *')
  async cleanup() {
    await this.db.query(
      'DELETE FROM t_auth_session WHERE expires_at<UTC_TIMESTAMP(6) OR revoked_at IS NOT NULL OR last_seen_at<DATE_SUB(UTC_TIMESTAMP(6),INTERVAL ? HOUR)',
      [Number(process.env.AUTH_IDLE_HOURS || 24)],
    );
    await this.db.query(
      'DELETE FROM t_auth_audit WHERE created_at<DATE_SUB(UTC_TIMESTAMP(6),INTERVAL 90 DAY)',
    );
  }
}
