'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAccount } from '@/auth/Boundary';
import { isPersonalAiOwner } from '@/auth/client';

/** Preserve old task bookmarks without mounting AI services on business pages. */
export default function useLegacyTaskLink() {
  const params = useSearchParams(); const router = useRouter(); const { user } = useAccount();
  const id = params.get('aiTask'); const date = params.get('date');
  useEffect(() => {
    if (!id || !isPersonalAiOwner(user)) return;
    const query = new URLSearchParams({ tab: 'history', aiTask: id });
    if (date) query.set('date', date);
    router.replace(`/admin/ai/?${query}`);
  }, [id, date, user, router]);
}
