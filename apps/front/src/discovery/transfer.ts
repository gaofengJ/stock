export const transferSchema = 'stock-domain-transfer/v1';
export function storageOwner(key: string): number | null {
  const match = /^(?:stock-review-(?:draft|inbox):v1:|personal-ai-draft:v2:|personal-ai-model:)(\d+)(?=:|$)/.exec(key);
  return match ? Number(match[1]) : null;
}
export function transferablePreference(key: string): boolean {
  return ['stock-theme', 'stock-feedback-floating-hidden', 'stock-feedback-floating-position', 'basic-daily-columns'].includes(key);
}
export function parseTransfer(raw: string) {
  if (raw.length > 25000000) throw Error('恢复文件超过 25 MB，请分开处理');
  const value = JSON.parse(raw);
  if (value.schema !== transferSchema || !Array.isArray(value.storage) || !Array.isArray(value.notebooks)
      || value.storage.length > 20000 || value.notebooks.length > 2000) throw Error('恢复文件格式无效');
  value.storage.forEach((row: { key: string; value: string }) => {
    if (typeof row.key !== 'string' || typeof row.value !== 'string' || row.key.length > 500 || (!storageOwner(row.key) && !transferablePreference(row.key))) throw Error('文件包含不支持的本机设置');
  });
  value.notebooks.forEach((row: { key: string; value: { revision: number; generation: number; content: unknown; savedAt: string } }) => {
    if (!/^\d+:\d{4}-\d{2}-\d{2}$/.test(row.key) || !row.value || !Number.isSafeInteger(row.value.revision) || row.value.revision < 0 || !Number.isSafeInteger(row.value.generation) || row.value.generation < 0
        || !row.value.content || typeof row.value.content !== 'object' || typeof row.value.savedAt !== 'string') throw Error('复盘草稿格式无效');
  });
  return value as { schema: string; storage: { key: string; value: string }[]; notebooks: { key: string; value: import('@/app/review/local-notebook').LocalNotebook }[] };
}
