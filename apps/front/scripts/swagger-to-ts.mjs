import { run } from 'mufeng-swagger-to-ts';

run({
  docUrl: 'http://127.0.0.1:3000/api-docs-json',
  includePaths: [
    '/api/source/daily/list',
    '/api/source/daily/{id}',
    '/api/source/daily/create',
    '/api/source/daily/bulk-create',
    '/api/source/daily/clear',
  ],
});
