'use client';

import React from 'react';

const MarketStoriesPage = () => {
  // 统一指向 VitePress 服务地址，由 VitePress 自身处理首页跳转
  // 在生产环境中，通过 Nginx 代理访问 /blog/ 路径
  // 在本地开发环境中，访问本地启动的 8082 端口服务
  const iframeSrc = process.env.NODE_ENV === 'development' ? 'http://localhost:8082' : '/blog/';

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
