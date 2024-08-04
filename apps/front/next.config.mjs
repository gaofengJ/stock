/** @type {import('next').NextConfig} */

const nextConfig = {
  output: 'export', // 静态导出
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://127.0.0.1:3000/api/:path*',
      },
    ];
  },
};

export default nextConfig;
