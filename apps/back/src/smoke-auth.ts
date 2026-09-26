/* eslint-disable no-restricted-syntax, no-await-in-loop -- Ordered database operations and bounded streams must execute sequentially. */
import { randomBytes } from 'crypto';
import dataSource from './migration-data-source';
import { AuthService, COOKIE, digest } from './modules/auth/auth.service';

/** Deployment-host CLI only. No HTTP endpoint can create these sessions. */
async function main() {
  const base = process.env.SMOKE_BASE_URL;
  if (!base || !/^https?:\/\//.test(base))
    throw new Error('Set SMOKE_BASE_URL to the deployed same-origin /api URL');
  const { origin } = new URL(base);
  const token = randomBytes(32).toString('hex');
  const tokenHash = digest(token);
  let auth: AuthService | undefined;
  try {
    await dataSource.initialize();
    auth = new AuthService(dataSource);
    const [admin] = await dataSource.query(
      "SELECT u.id,u.username FROM t_user u JOIN t_user_role ur ON ur.user_id=u.id JOIN t_role r ON r.id=ur.role_id WHERE r.code='admin' AND u.is_active=1 AND u.must_change_password=0 LIMIT 1",
    );
    if (!admin)
      throw new Error(
        'No active administrator available for smoke verification',
      );
    await dataSource.query(
      'INSERT INTO t_auth_session(user_id,token_hash,csrf_hash,last_seen_at,expires_at) VALUES (?,?,?,UTC_TIMESTAMP(6),DATE_ADD(UTC_TIMESTAMP(6),INTERVAL 5 MINUTE))',
      [admin.id, tokenHash, digest(digest(`csrf:${token}`))],
    );
    await auth.audit(null, 'deploy.smoke', admin.id, 'started');
    for (const endpoint of [
      '/auth/me',
      '/admin/users?pageSize=1',
      '/admin/sync-jobs?pageSize=1',
      '/admin/logs?pageSize=1',
    ]) {
      const url = new URL(base.replace(/\/$/, '') + endpoint);
      if (url.origin !== origin) throw new Error('Smoke URL origin mismatch');
      const response = await fetch(url, {
        headers: { Cookie: `${COOKIE}=${token}` },
        redirect: 'error',
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok || ((await response.json()) as any).code !== 0)
        throw new Error('Protected endpoint smoke check failed');
    }
    await auth.audit(null, 'deploy.smoke', admin.id, 'success');
    console.info('Protected API smoke checks passed');
  } finally {
    if (dataSource.isInitialized) {
      try {
        await dataSource.query(
          'DELETE FROM t_auth_session WHERE token_hash=?',
          [tokenHash],
        );
      } finally {
        await dataSource.destroy();
      }
    }
  }
}
main().catch(() => {
  console.error(
    'Authentication smoke check failed (credentials and response data omitted)',
  );
  process.exitCode = 1;
});
