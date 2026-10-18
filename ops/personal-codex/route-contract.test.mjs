import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
// Compare with the website's real route composition, not a duplicated mock URL.
test('AI market URLs match the existing frontend client and nested backend router',()=>{
 const root=new URL('../../',import.meta.url);
 const client=readFileSync(new URL('apps/front/src/api/market.ts',root),'utf8');
 const router=readFileSync(new URL('apps/back/src/modules/analysis/analysis.module.ts',root),'utf8');
 const controller=readFileSync(new URL('apps/back/src/modules/analysis/market/market.controller.ts',root),'utf8');
 const source=readFileSync(new URL('./context.mjs',import.meta.url),'utf8');
 const prefix=client.match(/`([^`]+)\$\{endpoint\}/)[1];
 assert.equal(prefix,'/analysis/market/');assert.match(router,/path: 'analysis'/);assert.match(controller,/@Controller\('market'\)/);
 for(const endpoint of ['candidate-environment','overview']) {
  assert(controller.includes("@Get('"+endpoint+"')"));
  assert.equal(source.split("'"+prefix+endpoint+'?').length-1,2,'both business contexts must use website route');
 }
 assert.doesNotMatch(source,/'\/market\//);
});
