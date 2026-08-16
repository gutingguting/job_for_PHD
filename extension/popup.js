const BASE = 'http://127.0.0.1:8420';
const pairPanel = document.getElementById('pair-panel');
const actionPanel = document.getElementById('action-panel');
const result = document.getElementById('result');

function show(message, error = false) {
  result.hidden = false;
  result.textContent = message;
  result.style.background = error ? '#9b2c2c' : '#172033';
}

async function token() {
  return (await chrome.storage.local.get('prefillToken')).prefillToken || '';
}

async function api(path, options = {}) {
  const auth = await token();
  const response = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}), ...(options.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `本地服务返回 ${response.status}`);
  return body;
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^https?:/i.test(tab.url || '')) throw new Error('请先打开招聘申请页面');
  return tab;
}

async function pageAction(action, payload = {}) {
  const tab = await activeTab();
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['adapters.js', 'content-script.js'] });
  const response = await chrome.tabs.sendMessage(tab.id, { source: 'job_for_PHD', action, ...payload });
  if (response?.error) throw new Error(response.error);
  return response;
}

async function refresh() {
  const connected = Boolean(await token());
  pairPanel.hidden = connected;
  actionPanel.hidden = !connected;
  if (!connected) return;
  try {
    const page = await pageAction('inspect');
    document.getElementById('site-status').textContent = `${page.ats.toUpperCase()} · 发现 ${page.field_count} 个可读取字段`;
  } catch (error) {
    document.getElementById('site-status').textContent = error.message;
  }
}

document.getElementById('pair-form').addEventListener('submit', async event => {
  event.preventDefault();
  try {
    const body = await api('/api/prefill/pair', { method: 'POST', body: JSON.stringify({ action: 'exchange', code: document.getElementById('pair-code').value }) });
    await chrome.storage.local.set({ prefillToken: body.pairing.token });
    show('已连接本地资料中心。');
    await refresh();
  } catch (error) { show(error.message, true); }
});

document.getElementById('import-btn').addEventListener('click', async event => {
  const button = event.currentTarget; button.disabled = true;
  try {
    const captured = await pageAction('extract');
    const body = await api('/api/prefill/import', { method: 'POST', body: JSON.stringify(captured) });
    const item = body.import;
    show(`提取完成\n识别 ${item.recognized_count} 项 · 保存 ${item.saved_count} 项\n排除敏感 ${item.excluded_count} 项 · 冲突 ${item.conflict_count} 项`);
  } catch (error) { show(error.message, true); }
  finally { button.disabled = false; }
});

document.getElementById('fill-btn').addEventListener('click', async event => {
  const button = event.currentTarget; button.disabled = true;
  try {
    const tab = await activeTab();
    const page = await pageAction('inspect');
    const body = await api(`/api/prefill/bundle?url=${encodeURIComponent(tab.url)}&employer=${encodeURIComponent(page.employer || '')}`);
    const response = await pageAction('fill', { bundle: body.bundle });
    show(`预填完成\n已填写 ${response.filled} 项 · 已有相同值 ${response.unchanged} 项\n缺少或歧义 ${response.skipped} 项 · 校验失败 ${response.rejected} 项\n请逐项检查后由你手动提交。`);
  } catch (error) { show(error.message, true); }
  finally { button.disabled = false; }
});

document.getElementById('disconnect-btn').addEventListener('click', async () => {
  await chrome.storage.local.remove('prefillToken'); result.hidden = true; await refresh();
});

refresh();
