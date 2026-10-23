export interface ReviewPick { tsCode: string; name: string }
export interface ReviewDraft {
  selected: ReviewPick[];
  notes: Record<string, string>;
  riskNotes: Record<string, string>;
  focus: string;
  exit: string;
  reason: string;
}

export const emptyDraft = (): ReviewDraft => ({
  selected: [], notes: {}, riskNotes: {}, focus: '', exit: '', reason: '',
});

export const draftKey = (account: number, date: string) => `stock-review-draft:v1:${account}:${date}`;

export function parseDraft(raw: string | null): ReviewDraft {
  if (!raw) return emptyDraft();
  const value = JSON.parse(raw);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid draft');
  const text = (input: unknown) => (typeof input === 'string' ? input.slice(0, 2000) : '');
  const records = (input: unknown): Record<string, string> => Object.fromEntries(
    Object.entries(input && typeof input === 'object' && !Array.isArray(input) ? input : {})
      .filter(([code]) => /^\d{6}\.(SH|SZ|BJ)$/.test(code))
      .map(([code, content]) => [code, text(content)]),
  );
  const selected: ReviewPick[] = [];
  (Array.isArray(value.selected) ? value.selected : []).forEach((pick: ReviewPick) => {
    if (pick && /^\d{6}\.(SH|SZ|BJ)$/.test(pick.tsCode) && !selected.some((r) => r.tsCode === pick.tsCode)) {
      selected.push({ tsCode: pick.tsCode, name: text(pick.name) || pick.tsCode });
    }
  });
  return {
    selected,
    notes: records(value.notes),
    riskNotes: records(value.riskNotes),
    focus: text(value.focus),
    exit: text(value.exit),
    reason: text(value.reason),
  };
}

/** Recover structured selections from the earlier saved plain-text representation. */
export function legacyDraft(evidence = ''): ReviewDraft {
  const result = emptyDraft();
  evidence.split(/\n\n+/).forEach((block) => {
    const match = block.match(/^(.+?) (\d{6}\.(?:SH|SZ|BJ))\n策略：/m);
    if (!match || result.selected.some((pick) => pick.tsCode === match[2])) return;
    result.selected.push({ tsCode: match[2], name: match[1] });
    const note = block.match(/观察与触发：([\s\S]*?)(?:\n风险核验：|$)/)?.[1];
    const risk = block.match(/风险核验：([\s\S]*)/)?.[1];
    if (note && note !== '未填写') result.notes[match[2]] = note.slice(0, 2000);
    if (risk && !risk.startsWith('未记录')) result.riskNotes[match[2]] = risk.slice(0, 2000);
  });
  return result;
}
