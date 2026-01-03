'use client';

import React from 'react';

const MarketStoriesPage = () => {
  // iframe src 指向新的代理路径
  const iframeSrc = process.env.NODE_ENV === 'development'
    ? 'http://localhost:8082'
    : '/blog-frame/';

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
