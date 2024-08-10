'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { EHeaderMenuKey } from '@/components/Layout/enum';

export default () => {
  const router = useRouter();

  useEffect(() => {
    /**
   * 初始化
   */
    const init = async () => {
      const isLoggedIn = true; // 是否已登录
      if (isLoggedIn) {
        router.push(EHeaderMenuKey.analysis);
      } else {
        router.push('/login');
      }
    };
    init();
  }, [router]);

  return null;
};
