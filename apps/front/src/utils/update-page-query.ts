// Native history keeps the current App Router page mounted while committed filters change.
export function updatePageQuery(changes: Record<string, string | undefined>) {
  const url = new URL(window.location.href);
  Object.entries(changes).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value); else url.searchParams.delete(key);
  });
  if (url.href !== window.location.href) window.history.pushState(null, '', url);
}
