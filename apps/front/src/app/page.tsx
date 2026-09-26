'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAccount } from '@/auth/Boundary';
import { homePath } from '@/auth/client';

export default function Page() { const { user } = useAccount(); const router = useRouter(); useEffect(() => { if (user) router.replace(homePath(user, '')); }, [user, router]); return null; }
