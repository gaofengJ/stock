'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import './globals.css';

export default () => {
  const router = useRouter();

  useEffect(() => {
    const isLoggedIn = true; // 是否已登录
    if (isLoggedIn) {
      router.push('/analysis');
    } else {
      router.push('/login');
    }
  }, [router]);

  return null;
};
