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
  LoginDto,
  PageDto,
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
const offset = (q: PageDto) => (q.page - 1) * q.pageSize;
const fail = () => new UnauthorizedException('账号或密码错误');

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

  async loginActivity(actor: CurrentUser) {
    const [cursor] = await this.db.query(
      'SELECT last_read_id FROM t_auth_activity_read WHERE user_id=?',
      [actor.id],
    );
    const lastRead = Number(cursor?.last_read_id || 0);
    const [summary] = await this.db.query(
      "SELECT COALESCE(MAX(id),0) latestId,COALESCE(SUM(id>?),0) unread FROM t_auth_audit WHERE action='auth.member-login' AND result='success'",
      [lastRead],
    );
    const items = await this.db.query(
      "SELECT a.id,a.actor_name username,u.nickname,a.detail,DATE_FORMAT(a.created_at,'%Y-%m-%dT%H:%i:%s.%fZ') createdAt FROM t_auth_audit a LEFT JOIN t_user u ON u.id=a.actor_id WHERE a.action='auth.member-login' AND a.result='success' ORDER BY a.id DESC LIMIT 50",
    );
    return {
      unread: Number(summary.unread),
      latestId: Number(summary.latestId),
      items: items.map(
        (item: {
          id: number;
          username: string;
          nickname: string;
          createdAt: string;
          detail: string;
        }) => ({
          id: item.id,
          username: item.username,
          nickname: item.nickname,
          createdAt: item.createdAt,
          registered: JSON.parse(item.detail || '{}').registered === true,
          unread: item.id > lastRead,
        }),
      ),
    };
  }

  async readLoginActivity(actor: CurrentUser, throughId: number) {
    // Clamp to a real event; marking a displayed snapshot does not consume
    // events that arrived while its drawer was open.
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
    if (dto.username === 'mufeng') throw new ConflictException('用户名不可用');
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
        throw new ConflictException('用户名不可用');
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
    const where = ` WHERE username LIKE ?${
      q.active === undefined ? '' : ' AND is_active=?'
    }`;
    const args: any[] = [`%${q.keyword || ''}%`];
    if (q.active !== undefined) args.push(q.active);
    const [{ total }] = await this.db.query(
      `SELECT COUNT(*) total FROM t_user${where}`,
      args,
    );
    const items = await this.db.query(
      `SELECT id,username,nickname,avatar,is_active active,must_change_password mustChangePassword,last_login lastLogin,created_at createdAt FROM t_user${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
      [...args, q.pageSize, offset(q)],
    );
    for (const u of items)
      u.roles = await this.db.query(
        'SELECT r.id,r.code,r.role_name name FROM t_role r JOIN t_user_role ur ON r.id=ur.role_id WHERE ur.user_id=?',
        [u.id],
      );
    return { items, total: Number(total) };
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

  async updateUser(actor: CurrentUser, id: number, dto: UserUpdateDto) {
    await this.db.transaction(async (m) => {
      await this.lockAdministration(m);
      const [user] = await m.query(
        'SELECT id FROM t_user WHERE id=? FOR UPDATE',
        [id],
      );
      if (!user) throw new NotFoundException('用户不存在');
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
          if (
            !(await m.query('SELECT id FROM t_role WHERE id=?', [role])).length
          )
            throw new BadRequestException('角色不存在');
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
      const [u] = await m.query('SELECT id FROM t_user WHERE id=? FOR UPDATE', [
        id,
      ]);
      if (!u) throw new NotFoundException('用户不存在');
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
    const rows = await this.db.query(
      'SELECT id,code,role_name name,`desc` description,builtin FROM t_role ORDER BY id',
    );
    for (const r of rows) {
      r.permissions = (
        await this.db.query(
          'SELECT p.code FROM t_permission p JOIN t_role_permission rp ON p.id=rp.permission_id WHERE rp.role_id=?',
          [r.id],
        )
      ).map((p: { code: string }) => p.code);
      r.users = await this.db.query(
        'SELECT u.id,u.username FROM t_user u JOIN t_user_role ur ON u.id=ur.user_id WHERE ur.role_id=?',
        [r.id],
      );
    }
    return rows;
  }

  async saveRole(actor: CurrentUser, id: number | null, dto: RoleDto) {
    const known = new Set(PERMISSIONS.map((p) => p.code));
    if (dto.permissions.some((p) => !known.has(p)))
      throw new BadRequestException('未知权限');
    try {
      return await this.db.transaction(async (m) => {
        await this.lockAdministration(m);
        if (id) {
          const [r] = await m.query(
            'SELECT code,builtin FROM t_role WHERE id=? FOR UPDATE',
            [id],
          );
          if (!r) throw new NotFoundException('角色不存在');
          if (r.code === 'admin')
            throw new ForbiddenException('系统管理员角色不可编辑');
          if (
            r.code === 'user' &&
            dto.permissions.some((p) => !DEFAULT_PERMISSIONS.includes(p))
          )
            throw new ForbiddenException('普通用户角色仅可配置业务查看权限');
          if (r.builtin && dto.code !== r.code)
            throw new ForbiddenException('内置角色编码不可修改');
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
