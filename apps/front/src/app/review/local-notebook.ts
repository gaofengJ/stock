import { NotebookContent } from './notebook-model';

export interface LocalNotebook { revision: number; generation: number; content: NotebookContent; savedAt: string }
const dbName = 'stock-notebook-recovery-v1';
const keyFor = (owner: number, date: string) => `${owner}:${date}`;
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('drafts');
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
}
export async function localNotebook(owner: number, date: string, value?: LocalNotebook | null): Promise<LocalNotebook | null> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('drafts', value === undefined ? 'readonly' : 'readwrite');
    const store = tx.objectStore('drafts'); const key = keyFor(owner, date);
    let result: LocalNotebook | null = null;
    let request: IDBRequest;
    if (value === undefined) request = store.get(key);
    else if (value === null) request = store.delete(key);
    else request = store.put(value, key);
    request.onsuccess = () => { if (value === undefined) result = request.result || null; };
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onerror = () => { db.close(); reject(tx.error || Error('本机草稿保存失败')); };
    tx.onabort = () => { db.close(); reject(tx.error || Error('本机草稿保存中断')); };
  });
}
