/** Component actions, downloads and same-document links do not discard notebook edits. */
export function leavesDocument(anchor: HTMLAnchorElement, event: MouseEvent, location: string): boolean {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  const href = anchor.getAttribute('href');
  if (!href || anchor.hasAttribute('download') || (anchor.target && anchor.target !== '_self')) return false;
  const next = new URL(href, location);
  if (!['http:', 'https:'].includes(next.protocol)) return false;
  const current = new URL(location);
  return next.origin !== current.origin || next.pathname !== current.pathname || next.search !== current.search;
}
