import FastifyCookie from '@fastify/cookie';
import FastifyMultipart from '@fastify/multipart';

import { FastifyAdapter } from '@nestjs/platform-fastify';

export const fastifyApp: FastifyAdapter = new FastifyAdapter({
  trustProxy: true,
  logger: false,
});

fastifyApp.register(FastifyMultipart, {
  limits: {
    fields: 10,
    fileSize: 1024 * 1024 * 50,
    files: 5,
  },
});

fastifyApp.register(FastifyCookie, {
  secret: 'cookie-secret', // 这个 secret 不太重要，不存鉴权相关，无关紧要
});

// eslint-disable-next-line consistent-return
fastifyApp.getInstance().addHook('onRequest', (request, reply, done) => {
  const { origin } = request.headers;
  if (!origin) request.headers.origin = request.headers.host;

  const { url } = request;
  // skip favicon request
  if (url.match(/favicon.ico$/) || url.match(/manifest.json$/))
    return reply.code(204).send();

  done();
});
