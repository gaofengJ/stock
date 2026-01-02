'use client';

import React from 'react';

const MarketStoriesPage = () => {
  const iframeSrc = 'http://localhost:8089';

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
