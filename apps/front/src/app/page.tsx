'use client';

import { useRouter } from 'next/navigation';
import './globals.css';

export default () => {
  const router = useRouter();

  const isLoggedIn = true; // 是否已登录
  if (isLoggedIn) {
    router.push('/analysis');
  } else {
    router.push('/login');
  }
  return null;
};
