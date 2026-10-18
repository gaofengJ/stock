import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Fault, fail, parseEvent, quotaView, MODELS, sha } from './core.mjs';

export class Runner {
  constructor({ bin = '/usr/local/bin/codex', home = '/home/codex/.codex', proxyFile = '/run/connection/proxy', timeout = 180000, spawnFn = spawn } = {}) {
    Object.assign(this, { bin, home, proxyFile, timeout, spawnFn });
    this.child = null; this.metaPending = null;
  }
  env() {
    const a = JSON.parse(readFileSync(join(this.home, 'auth.json'), 'utf8'));
    if (a.auth_mode !== 'chatgpt' || a.OPENAI_API_KEY) fail(503, '订阅登录状态异常，未发起调用');
    const proxy = readFileSync(this.proxyFile, 'utf8').trim();
    const url = new URL(proxy);
    if (url.protocol !== 'http:' || url.hostname !== 'stock-ai-proxy' || url.port !== '7890') fail(503, '代理配置不匹配');
    return { PATH: '/usr/local/bin:/usr/bin:/bin', HOME: '/home/codex', CODEX_HOME: this.home,
      SSL_CERT_FILE: '/etc/ssl/certs/ca-certificates.crt', RUST_LOG: 'off',
      HTTPS_PROXY: proxy, HTTP_PROXY: proxy, https_proxy: proxy, http_proxy: proxy };
  }
  checkpoint() {
    // A root-owned host path unit encrypts the updated auth file. No token enters an HTTP response or log.
    try { writeFileSync('/home/codex/checkpoint', String(Date.now()), { mode: 0o600 }); } catch { /* status shown by deployment health checks */ }
  }
  async metadata() {
    if (this.metaPending) return this.metaPending;
    if (this.child) fail(409, '任务运行中，完成后再刷新账号状态');
    this.metaPending = this.readMetadata().finally(() => { this.metaPending = null; });
    return this.metaPending;
  }
  async readMetadata() {
    const child = this.spawnFn(this.bin, ['app-server', '--listen', 'stdio://'], { env: this.env(), stdio: ['pipe', 'pipe', 'ignore'] });
    let buffer = '', seq = 0; const pending = new Map();
    const abort = () => { for (const p of pending.values()) p.reject(new Fault(503, '账号状态查询失败')); pending.clear(); };
    child.on('error', abort); child.on('close', abort);
    child.stdin.on('error', abort);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      buffer += chunk.toString();
      if (buffer.length > 1024 * 1024) { child.kill('SIGKILL'); return; }
      let index;
      while ((index = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, index); buffer = buffer.slice(index + 1);
        try { const m = JSON.parse(line); const p = pending.get(m.id); if (p) { pending.delete(m.id); m.error ? p.reject(new Fault(503, '账号状态查询失败')) : p.resolve(m.result); } } catch { /* ignore non-protocol lines */ }
      }
    });
    const timer = setTimeout(() => { abort(); child.kill('SIGKILL'); }, 25000);
    const rpc = (method, params) => new Promise((resolve, reject) => {
      const id = ++seq; pending.set(id, { resolve, reject }); child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
    });
    try {
      await rpc('initialize', { clientInfo: { name: 'stock_personal_console', version: '1.0.0' }, capabilities: { experimentalApi: true } });
      child.stdin.write('{"method":"initialized","params":{}}\n');
      const { account } = await rpc('account/read', { refreshToken: false });
      if (account?.type !== 'chatgpt') fail(503, '需要本人 ChatGPT 订阅登录');
      if (sha(account.email || '') !== readFileSync('/run/console/owner.sha256', 'utf8').trim()) fail(503, '订阅账号与绑定账号不匹配');
      const raw = await rpc('account/rateLimits/read', {});
      const models = await rpc('model/list', { limit: 100, includeHidden: false });
      return { authType: 'chatgpt', plan: account.planType, quota: quotaView(raw), checkedAt: new Date().toISOString(),
        models: (models.data || []).filter(m => MODELS.includes(m.model)).map(m => ({ model: m.model, efforts: (m.supportedReasoningEfforts || []).map(e => e.reasoningEffort) })) };
    } finally {
      clearTimeout(timer); abort(); child.stdin.end();
      await new Promise(resolve => {
        if (child.exitCode !== null) { resolve(); return; }
        const killer = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 2000);
        child.once('close', () => { clearTimeout(killer); resolve(); });
      });
      this.checkpoint();
    }
  }
  stop() {
    if (!this.child) return;
    const child = this.child;
    try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill('SIGTERM'); }
    const timer = setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); } }, 1500);
    timer.unref();
  }
  async run(task, prompt) {
    if (this.child || this.metaPending) fail(409, '执行器忙，请稍后重试');
    const args = ['exec', '--json', '--ephemeral', '--skip-git-repo-check', '--sandbox', 'read-only', '--color', 'never', '-C', '/workspace',
      '-m', task.model, '-c', `model_reasoning_effort="${task.effort}"`, '-c', 'forced_login_method="chatgpt"', '-c', 'approval_policy="never"', '-c', 'web_search="disabled"'];
    for (const f of ['shell_tool', 'unified_exec', 'multi_agent', 'sleep_tool', 'shell_snapshot']) args.push('--disable', f);
    args.push('-');
    const report = { completedTurns: 0, answer: '', usage: null, failed: false, toolAttempt: false };
    const child = this.spawnFn(this.bin, args, { env: this.env(), cwd: '/workspace', detached: true, stdio: ['pipe', 'pipe', 'ignore'] });
    this.child = child; let buffer = '', bytes = 0, timeout = false, overflow = false;
    const started = Date.now(), metrics={firstEventMs:null, firstAnswerMs:null, processMs:null, eventCount:0, streamBytes:0};
    child.stdout.setEncoding('utf8');
    const timer = setTimeout(() => { timeout = true; this.stop(); }, this.timeout);
    child.stdout.on('data', data => {
      bytes += Buffer.byteLength(data);
      if (bytes > 512000) { overflow = true; this.stop(); return; }
      buffer += data.toString(); let index;
      while ((index = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, index); buffer = buffer.slice(index + 1);
        try {
          const event=JSON.parse(line); metrics.eventCount++; metrics.firstEventMs ??= Date.now()-started;
          if (event.type==='item.completed' && event.item?.type==='agent_message') metrics.firstAnswerMs ??= Date.now()-started;
          parseEvent(report,event);
        } catch { /* never expose raw diagnostic lines */ }
        if (report.toolAttempt || report.answer.length > 16000) { overflow = true; this.stop(); }
      }
    });
    child.stdin.on('error', () => {});
    try {
      const closed = new Promise(resolve => { child.once('error', () => resolve(-1)); child.once('close', code => resolve(code)); });
      child.stdin.end(prompt);
      const code = await closed;
      metrics.processMs=Date.now()-started; metrics.streamBytes=bytes;
      return { ...report, metrics, success: code === 0 && report.completedTurns === 1 && !report.failed && !overflow && !timeout && !!report.answer,
        timeout, error: timeout ? '任务超时，已停止；已发生用量无法撤销' : overflow ? '工具请求或输出超限，已停止' : code !== 0 || report.failed ? '模型调用失败，未自动重提任务；请查看账号状态' : null };
    } finally { clearTimeout(timer); this.child = null; this.checkpoint(); }
  }
}
