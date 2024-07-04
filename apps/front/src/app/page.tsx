'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import './globals.css';
import { EHeaderMenuKey } from '@/components/Layout/enum';

export default () => {
  const router = useRouter();

  useEffect(() => {
    const isLoggedIn = true; // 是否已登录
    if (isLoggedIn) {
      router.push(EHeaderMenuKey.analysis);
    } else {
      router.push('/login');
    }
  }, [router]);

  return null;
};
