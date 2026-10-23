import { CollectedItem, emptyWorkspace, validateWorkspace } from '@/app/review/workspace-contract';

export const collectionEvent = 'stock-review-collection';
const key = (owner: number, date: string) => `stock-review-inbox:v1:${owner}:${date}`;
export function readCollection(owner: number, date: string): CollectedItem[] {
  const raw = localStorage.getItem(key(owner, date));
  return raw ? validateWorkspace({ ...emptyWorkspace(), items: JSON.parse(raw) }).items : [];
}
export function writeCollection(owner: number, date: string, items: CollectedItem[]) {
  const checked = validateWorkspace({ ...emptyWorkspace(), items });
  localStorage.setItem(key(owner, date), JSON.stringify(checked.items));
  window.dispatchEvent(new Event(collectionEvent));
}
export function collectItem(owner: number, item: CollectedItem) {
  const current = readCollection(owner, item.date);
  if (!current.some((row) => row.id === item.id)) writeCollection(owner, item.date, [...current, item]);
}
export function acknowledgeCollection(owner: number, date: string, ids: string[]) {
  writeCollection(owner, date, readCollection(owner, date).filter((item) => !ids.includes(item.id)));
}
