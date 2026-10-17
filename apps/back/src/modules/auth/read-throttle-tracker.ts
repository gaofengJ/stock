import type { AuthRequest } from './auth.service';

/** AuthGuard supplies the verified identity before ThrottlerGuard runs. Never trust client identity headers. */
export function readThrottleTracker(req: AuthRequest): string {
  return req.authSession?.user_id
    ? `user:${req.authSession.user_id}`
    : `ip:${req.ip}`;
}
