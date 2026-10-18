// Codex app-server NDJSON protocol. Only agent text is exposed to the browser.
export function streamTurn(child, task, prompt, report, onText, stop) {
  let buffer = '', seq = 0, ended = false;
  const pending = new Map(), messages = new Map();
  const write = value => { if (!child.stdin.destroyed) child.stdin.write(JSON.stringify(value) + '\n'); };
  const rpc = (method, params) => new Promise((resolve, reject) => {
    const id = ++seq; pending.set(id, { resolve, reject }); write({ id, method, params });
  });
  const publish = () => { report.answer = [...messages.values()].filter(m => m.phase !== 'commentary').map(m => m.text).join('\n\n'); onText(report.answer); };
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', chunk => {
    buffer += chunk;
    if (buffer.length > 512000) { report.failed = true; stop(); return; }
    let index;
    while ((index = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, index); buffer = buffer.slice(index + 1);
      let event; try { event = JSON.parse(line); } catch { continue; }
      const p = event.params || {};
      if (event.id != null && !event.method) {
        const request = pending.get(event.id); pending.delete(event.id);
        if (request) event.error ? request.reject(Error('Codex protocol error')) : request.resolve(event.result);
        continue;
      }
      if (event.id != null && event.method) {
        // No approvals, credential refresh requests or interactive tools are accepted.
        write({ id: event.id, error: { code: -32601, message: 'Tools and interactive requests disabled' } });
        report.toolAttempt = true; stop(); continue;
      }
      if (event.method === 'item/started' && !['agentMessage', 'reasoning', 'userMessage'].includes(p.item?.type)) {
        report.toolAttempt = true; stop(); continue;
      }
      if (['item/started', 'item/completed'].includes(event.method) && p.item?.type === 'agentMessage') {
        const previous = messages.get(p.item.id);
        messages.set(p.item.id, { phase: p.item.phase, text: p.item.text || previous?.text || '' }); publish();
      }
      if (event.method === 'item/agentMessage/delta') {
        const item = messages.get(p.itemId) || { text: '' };
        item.text += p.delta || ''; messages.set(p.itemId, item); publish();
      }
      if (report.answer.length > 16000) { report.failed = true; stop(); }
      if (event.method === 'thread/tokenUsage/updated') {
        const u = p.tokenUsage?.last;
        if (u) report.usage = { input_tokens: u.inputTokens, cached_input_tokens: u.cachedInputTokens, output_tokens: u.outputTokens, reasoning_output_tokens: u.reasoningOutputTokens };
      }
      if (event.method === 'turn/completed' && !ended) {
        ended = true; report.completedTurns = p.turn?.status === 'completed' ? 1 : 0;
        report.failed ||= p.turn?.status !== 'completed'; child.stdin.end();
      }
      if (event.method === 'error' && !p.willRetry) { report.failed = true; stop(); }
    }
  });
  child.once('close', () => { for (const request of pending.values()) request.reject(Error('Codex closed')); pending.clear(); });
  return (async () => {
    await rpc('initialize', { clientInfo: { name: 'stock_personal_console', version: '2.0.0' }, capabilities: { experimentalApi: true } });
    write({ method: 'initialized', params: {} });
    const result = await rpc('thread/start', { model: task.model, ephemeral: true, cwd: '/workspace', approvalPolicy: 'never', sandbox: 'read-only' });
    await rpc('turn/start', { threadId: result.thread.id, effort: task.effort, input: [{ type: 'text', text: prompt, text_elements: [] }] });
  })().catch(() => { report.failed = true; stop(); });
}
