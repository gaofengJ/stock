import type { ReviewPick } from './review-draft';

// Page selection only changes the visible rows, never hidden selections.
export function selectWatchRows(selected: ReviewPick[], rows: ReviewPick[], checked: boolean) {
  const codes = new Set(rows.map((row) => row.tsCode));
  return checked
    ? [...selected, ...rows.filter((row) => !selected.some((pick) => pick.tsCode === row.tsCode)).map(({ tsCode, name }) => ({ tsCode, name }))]
    : selected.filter((pick) => !codes.has(pick.tsCode));
}
