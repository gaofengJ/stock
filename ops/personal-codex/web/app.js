const $ = id => document.getElementById(id);
const embedded = window.parent !== window && new URLSearchParams(location.search).get('embedded') === '1';
let viewStatus = 'loading';
function reportView() {
  if (embedded) window.parent.postMessage({ type: 'personal-ai-view', status: viewStatus, height: document.body.scrollHeight }, location.origin);
}
if (embedded) {
  document.body.classList.add('embedded');
  new ResizeObserver(reportView).observe(document.body);
}
const statusNames = { preparing: '准备数据与额度检查', running: '正在分析', cancelling: '正在停止', completed: '已完成', failed: '失败', cancelled: '已取消', interrupted: '服务重启中断' };
let state, chosen, parentId = null, polling = null, busy = false;
function notice(text, error = false) { $('notice').textContent = text; $('notice').classList.toggle('error', error); }
async function request(path, method = 'GET', body) {
  const headers = {};
  if (method !== 'GET') {
    const r = await fetch('/api/auth/csrf', { credentials: 'same-origin', cache: 'no-store' });
    const b = await r.json();
    if (!r.ok || !b.data?.csrfToken) throw Error('登录已失效，请返回网站重新登录');
    headers['X-CSRF-Token'] = b.data.csrfToken;
    headers['Content-Type'] = 'application/json';
  }
  const r = await fetch(`/personal-ai/api${path}`, { method, headers, credentials: 'same-origin', cache: 'no-store', body: body === undefined ? undefined : JSON.stringify(body) });
  const b = await r.json(); if (!r.ok) throw Error(b.error || '请求失败'); return b;
}
function models() {
  const available = state?.metadata?.models;
  for (const o of $('model').options) o.disabled = available ? !available.some(m => m.model === o.value) : false;
  const efforts = available?.find(m => m.model === $('model').value)?.efforts;
  for (const o of $('effort').options) o.disabled = efforts ? !efforts.includes(o.value) : false;
  if ($('effort').selectedOptions[0]?.disabled) $('effort').value = efforts.includes('high') ? 'high' : efforts[0];
}
function renderState() {
  $('owner').textContent = state.user.username;
  $('calls').textContent = `${state.today.calls} / ${state.limits.dailyCalls}`;
  $('tokens').textContent = `${state.today.tokens.toLocaleString()} / ${state.limits.dailyTokens.toLocaleString()}`;
  const q = state.metadata?.quota?.primary;
  $('quota').textContent = q ? `剩余约 ${Math.max(0, 100 - q.usedPercent)}%` : '尚未查询';
  $('submit').disabled = busy || !state.enabled || state.tasks.some(t => ['preparing', 'running', 'cancelling'].includes(t.status));
  $('history').replaceChildren();
  for (const task of state.tasks) {
    const row = document.createElement('div'); row.className = 'history-row';
    for (const text of [task.date + '，' + (task.skill === 'market-review' ? '复盘' : '对比'), task.model + ' / ' + task.effort, statusNames[task.status] || task.status]) {
      const span = document.createElement('span'); span.textContent = text; row.append(span);
    }
    const b = document.createElement('button'); b.textContent = '查看'; b.className = 'secondary'; b.onclick = () => selectTask(task.id).catch(e => notice(e.message, true)); row.append(b); $('history').append(row);
  }
  if (!state.tasks.length) $('history').textContent = '暂无任务';
  models();
}
async function refresh() { state = await request('/status'); renderState(); }
async function selectTask(id) {
  chosen = await request(`/tasks/${id}`);
  const active = ['preparing', 'running', 'cancelling'].includes(chosen.status);
  $('cancel').disabled = !active; $('followup').disabled = chosen.status !== 'completed' || chosen.historyTurns >= 6;
  const u = chosen.usage;
  $('task-info').textContent = `${chosen.model} / ${chosen.effort}，${statusNames[chosen.status]}${u ? `，输入 ${u.input_tokens ?? '未知'} / 缓存 ${u.cached_input_tokens ?? '未知'} / 输出 ${u.output_tokens ?? '未知'} / 推理 ${u.reasoning_output_tokens ?? '未知'} Token` : '，用量尚未返回'}`;
  $('messages').replaceChildren();
  for (const [text, cls] of [[chosen.message, 'user'], [chosen.answer || chosen.error || '任务执行中；可离开页面，回来后查看。', 'assistant']]) {
    const p = document.createElement('div'); p.className = `bubble ${cls}`; p.textContent = text; $('messages').append(p);
  }
  clearTimeout(polling);
  if (active) polling = setTimeout(async () => { if (document.hidden) return; try { await refresh(); await selectTask(id); } catch (e) { notice(e.message, true); } }, 5000);
}
$('task-form').onsubmit = async event => {
  event.preventDefault(); if (busy) return; busy = true; $('submit').disabled = true;
  try {
    const task = await request('/tasks', 'POST', { key: crypto.randomUUID(), parentId, skill: $('skill').value, date: $('date').value,
      model: $('model').value, effort: $('effort').value, codes: $('codes').value.split(/[,，\s]+/).filter(Boolean).map(x => x.toUpperCase()), message: $('message').value });
    notice('任务已提交。不会自动购买 credits、切换 API 或重提失败任务。'); await refresh(); await selectTask(task.id);
  } catch (e) { notice(e.message, true); } finally { busy = false; if (state) renderState(); }
};
$('new-chat').onclick = () => { parentId = null; for (const id of ['skill', 'date', 'codes']) $(id).disabled = false; $('context').textContent = '新会话，只发送所选业务数据及本轮问题'; $('message').value = ''; $('message').focus(); };
$('followup').onclick = () => {
  if (!chosen || chosen.status !== 'completed' || chosen.historyTurns >= 6) return;
  parentId = chosen.id;
  for (const id of ['skill', 'date', 'model', 'effort']) $(id).value = chosen[id];
  $('codes').value = chosen.codes.join(', ');
  for (const id of ['skill', 'date', 'codes']) $(id).disabled = true;
  $('context').textContent = `沿用 ${chosen.date} 的数据快照，下一轮为第 ${chosen.historyTurns + 1} 次追问（最多6次）`;
  $('message').value = ''; $('message').focus(); models();
};
$('cancel').onclick = async () => { try { await request(`/tasks/${chosen.id}/cancel`, 'POST', {}); await selectTask(chosen.id); } catch (e) { notice(e.message, true); } };
$('refresh-account').onclick = async () => {
  $('refresh-account').disabled = true;
  try { const m = await request('/account', 'POST', {}); await refresh(); notice(`已确认 ${m.plan} 订阅登录，模型目录和额度已刷新；未发起推理。`); }
  catch (e) { notice(e.message, true); } finally { $('refresh-account').disabled = false; }
};
$('model').onchange = models;
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh().then(() => chosen && selectTask(chosen.id)).catch(e => notice(e.message, true)); });
const date = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10); $('date').value = date; $('date').max = date;
refresh().then(async () => { viewStatus = 'ready'; reportView(); notice('仅本人管理员可用。每次点击“开始分析”或发送追问才会调用模型。'); const active = state.tasks.find(t => ['preparing', 'running', 'cancelling'].includes(t.status)); if (active) await selectTask(active.id); }).catch(e => { viewStatus = 'error'; reportView(); notice(e.message + '；请先返回网站登录。', true); $('submit').disabled = true; });
