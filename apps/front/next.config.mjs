/** @type {import('next').NextConfig} */

const nextConfig = {
  output: 'export', // 静态导出
  /**
   * trailingSlash: true：
    在静态导出模式下，访问 /about/ 会渲染 about.html 页面。
    静态文件将生成在 out/about/index.html，并且 URL 映射到 /about/。
    trailingSlash: false：

    在静态导出模式下，访问 /about 会渲染 about.html 页面。
    静态文件将生成在 out/about.html，并且 URL 映射到 /about。
   */
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
