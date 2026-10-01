// Only article paths may be supplied through a shared URL or iframe message.
export function normalizeBlogPath(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 2048) return undefined;
  let decoded: string;
  try { decoded = decodeURIComponent(value); } catch { return undefined; }
  // eslint-disable-next-line no-control-regex -- Reject control characters in shared paths.
  if (!decoded.startsWith('/') || /[\\?\x00-\x20]/.test(decoded) || decoded.startsWith('//')) return undefined;
  const [pathname] = decoded.split('#');
  if (pathname.split('/').some((part) => part === '.' || part === '..')) return undefined;
  if (!/^\/[\p{L}\p{N}_/.-]*(?:\.html)?(?:#[^?\\\s]*)?$/u.test(decoded)) return undefined;
  return value.replace(/^\/blog-frame\//, '/').replace(/\.html(?=#|$)/, '');
}
