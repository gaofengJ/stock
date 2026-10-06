const shared = new Set(['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', '.npmrc', '.dockerignore']);

function releaseScope(files, complete = true, eventName = '') {
  // GitHub may replace a pending push with a later one even when cancellation
  // of the running workflow is disabled. Release the whole current revision so
  // a frontend-only follow-up cannot leave an earlier backend change undeployed.
  if (eventName === 'push' || !complete) return { backend: true, frontend: true };
  const infrastructure = files.some(file => shared.has(file) || file.startsWith('.github/'));
  const backend = infrastructure || files.some(file => file.startsWith('apps/back/'));
  // 后端发布仍同步前端，保留此前联动发布失败后的恢复能力。
  const frontend = backend || files.some(file => file.startsWith('apps/front/'));
  return { backend, frontend };
}
module.exports = { releaseScope };
