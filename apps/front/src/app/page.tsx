'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { useOptionsState } from '@/store/useOptionsStore';
import { EHeaderMenuKey } from '@/components/Layout/enum';

export default () => {
  const router = useRouter();
  const { getAllOptions } = useOptionsState();

  useEffect(() => {
    /**
   * 初始化
   */
    const init = async () => {
      await getAllOptions(); // 获取所有选项
      const isLoggedIn = true; // 是否已登录
      if (isLoggedIn) {
        router.push(EHeaderMenuKey.analysis);
      } else {
        router.push('/login');
      }
    };
    init();
  }, [getAllOptions, router]);

  return null;
};
