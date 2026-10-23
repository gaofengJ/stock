type LeaveGuard = () => Promise<boolean>;
let guard: LeaveGuard | null = null;
export function registerLeaveGuard(value: LeaveGuard) { guard = value; return () => { if (guard === value) guard = null; }; }
export async function mayLeaveResearch() { return guard ? guard() : true; }
export function researchHref(path: string, current: string) {
  const source = new URL(current, 'https://stock.invalid'); const target = new URL(path, source);
  if (target.origin !== source.origin) return path;
  const date = source.searchParams.get('date');
  if (target.origin === source.origin && /^\/(analysis|strategy|basic|news|review)(\/|$)/.test(target.pathname) && date && /^\d{4}-\d{2}-\d{2}$/.test(date) && !target.searchParams.has('date')) target.searchParams.set('date', date);
  return `${target.pathname}${target.search}${target.hash}`;
}
