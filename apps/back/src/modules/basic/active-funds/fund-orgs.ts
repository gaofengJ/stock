/** Older catalog records may have null or malformed seat JSON; one record must not break the directory. */
export function fundOrgs(value: string | null) {
  try {
    const rows: unknown = JSON.parse(value || '[]');
    if (!Array.isArray(rows)) return [];
    const seen = new Set<string>();
    return rows.filter((row): row is string => {
      if (typeof row !== 'string') return false;
      const key = row.normalize('NFKC').replace(/\s+/g, '');
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  } catch {
    return [];
  }
}
