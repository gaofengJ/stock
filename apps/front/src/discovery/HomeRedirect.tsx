'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getAccess, homePath } from '@/auth/client';

// Public visits never start trials; preserve the signed-in homepage redirect.
export default function HomeRedirect() {
  const router = useRouter();
  useEffect(() => {
    let active = true;
    getAccess(false).then(({ user }) => {
      if (active && user && !user.guest) router.replace(user.mustChangePassword ? '/profile/' : homePath(user));
    }).catch(() => { /* Public content remains available when account services are offline. */ });
    return () => { active = false; };
  }, [router]);
  return null;
}
