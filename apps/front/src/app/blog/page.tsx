'use client';

import React from 'react';

const MarketStoriesPage = () => {
  // 统一指向 VitePress 服务地址，由 VitePress 自身处理首页跳转
  const iframeSrc = 'http://localhost:8082';

  return (
    <div className="w-full h-full">
      <iframe
        src={iframeSrc}
        className="w-full h-full border-none"
        title="Market Stories"
      />
    </div>
  );
};

export default MarketStoriesPage;
