const sensitive =
  /password|passwd|secret|token|cookie|authorization|session|credential|csrf|currentPassword|newPassword/i;
export function redact(value: unknown, depth = 0): any {
  if (depth > 8) return '[truncated]';
  if (value instanceof Date)
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (value instanceof Error)
    return {
      name: value.name,
      message: redact(value.message, depth + 1),
      stack: redact(value.stack, depth + 1),
    };
  if (Array.isArray(value))
    return value.slice(0, 100).map((v) => redact(v, depth + 1));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        sensitive.test(k) ? '[redacted]' : redact(v, depth + 1),
      ]),
    );
  if (typeof value === 'string')
    return value
      .replace(
        /((?:authorization|cookie|set-cookie)\s*["']?\s*[:=]\s*)[^\r\n]+/gi,
        '$1[redacted]',
      )
      .replace(/\$argon2id\$[^\s"'<>]+/g, '[password hash]')
      .replace(
        /((?:password|passwd|secret|token|cookie|authorization|session|csrf)[\w-]*\s*["']?\s*[:=]\s*["']?)[^\s"'<>,;&}]+/gi,
        '$1[redacted]',
      )
      .slice(0, 12000);
  return value;
}
