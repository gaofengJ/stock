const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../src/app/admin/sync/job-handling.ts'), 'utf8');
const sandbox = { exports: {} };
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, sandbox);
const { handlingMessage, isHistorical, needsWarning, canRequeue } = sandbox.exports;

test('covered history retains its outcome but directs the user to the successor', () => {
  const job = { status: 'failed', handling: 'continued', successorId: 628, successorStatus: 'pending' };
  assert.equal(needsWarning(job), false);
  assert.equal(canRequeue(job), false);
  assert.equal(isHistorical(job), true);
  assert.match(handlingMessage(job), /#628/);
  assert.match(handlingMessage(job), /数据缺口仍在处理/);
  assert.match(handlingMessage({ ...job, successorStatus: 'failed' }), /请检查后续任务/);
  assert.match(handlingMessage({ ...job, handling: 'recovered' }), /校验/);
});
test('source waiting has guidance and avoids repetitive retries without hiding real failures', () => {
  assert.equal(canRequeue({ status: 'pending', handling: 'source-wait' }), false);
  assert.match(handlingMessage({ status: 'pending', handling: 'source-wait' }), /不会增加失败次数/);
  assert.equal(canRequeue({ status: 'failed', handling: 'needs-attention' }), true);
  assert.equal(needsWarning({ status: 'failed', handling: 'needs-attention' }), true);
  assert.equal(canRequeue({ status: 'paused', handling: 'normal' }), true);
  assert.equal(canRequeue({ status: 'running' }), false);
  assert.equal(canRequeue({ status: 'failed' }), true, 'Older API responses keep the existing controls');
});
