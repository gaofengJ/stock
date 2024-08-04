/** @type {import('next').NextConfig} */

const nextConfig = {
  output: 'export', // 静态导出
  trailingSlash: true,
  async rewrites() { // 仅在本地生效
    return [
      {
        source: '/api/:path*',
        destination: 'http://127.0.0.1:3000/api/:path*',
      },
    ];
  },
};

export default nextConfig;
