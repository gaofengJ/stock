import FastifyCookie from '@fastify/cookie';
import FastifyMultipart from '@fastify/multipart';
import { HttpStatus } from '@nestjs/common';
import { FastifyAdapter } from '@nestjs/platform-fastify';

/**
 * 创建一个 FastifyAdapter 实例
 */
export const fastifyApp: FastifyAdapter = new FastifyAdapter({
  trustProxy: process.env.TRUST_PROXY === 'true', // 启用信任代理，使 Fastify 能够正确处理代理头部
  logger: false, // 禁用 Fastify 默认的日志记录器
  requestTimeout: 1000 * 60 * 60, // 设置接口超时时间，表示在等待客户端请求的超时时间，防止导入数据时超时
});

// 注册 FastifyMultipart 插件，并设置文件上传的限制
fastifyApp.register(FastifyMultipart, {
  limits: {
    fields: 10, // 允许的字段数量
    fileSize: 1024 * 1024 * 50, // 允许的文件大小，这里设置为 50MB
    files: 5, // 允许的文件数量
  },
});

// 注册 FastifyCookie 插件，并设置 Cookie 的密钥
fastifyApp.register(FastifyCookie, {});

// eslint-disable-next-line consistent-return
fastifyApp.getInstance().addHook('onRequest', (request, reply, done) => {
  const { url } = request;
  // 跳过 favicon.ico 和 manifest.json 请求，返回 204 状态码
  if (url.match(/favicon.ico$/) || url.match(/manifest.json$/))
    return reply.code(HttpStatus.NO_CONTENT).send();
  done(); // 继续处理请求
});
