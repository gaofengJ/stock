import type { NSGetBasicActiveFundsList } from '@/api/services.types';

// Normalize typography only: similar branch names must not be treated as the same seat.
export const normalizeOrg = (value: string) => value.normalize('NFKC').replace(/\s+/g, '').trim();
export function matchingFunds(funds: NSGetBasicActiveFundsList.IRes, org: string) {
  const name = normalizeOrg(org);
  return name ? funds.filter((fund) => fund.orgs.some((item) => normalizeOrg(item) === name)) : [];
}
export const activeFundsHref = (org: string) => `/basic/active-funds/?${new URLSearchParams({ org })}`;
