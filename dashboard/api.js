export async function request(url, options = {}) {
  const response = await fetch(url, { cache: 'no-store', ...options });
  const type = response.headers.get('content-type') || '';
  const body = type.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) {
    const error = new Error(body?.error || body || `HTTP ${response.status}`);
    error.details = body?.details;
    error.status = response.status;
    throw error;
  }
  return body;
}

export const api = {
  health: () => request('/api/health'),
  profile: () => request('/api/profile'),
  saveProfile: profile => request('/api/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(profile) }),
  preferences: () => request('/api/preferences'),
  savePreferences: preferences => request('/api/preferences', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(preferences) }),
  onboarding: () => request('/api/onboarding'),
  saveOnboarding: currentStep => request('/api/onboarding', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ current_step: currentStep }) }),
  completeOnboarding: () => request('/api/onboarding/complete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }),
  resumes: () => request('/api/resumes'),
  uploadResume: form => request('/api/resumes', { method: 'POST', body: form }),
  patchResume: (id, value) => request(`/api/resumes/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) }),
  archiveResume: id => request(`/api/resumes/${id}/archive`, { method: 'POST' }),
  postdocs: () => request('/api/postdocs'),
  createPostdoc: value => request('/api/postdocs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) }),
  updatePostdoc: (id, value) => request(`/api/postdocs/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) }),
  updateJob: (id, value) => request(`/api/jobs/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) }),
  updateJobStatus: value => request('/api/update-status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) }),
  calendar: (action, value) => request(`/api/calendar/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) }),
  outlookStatus: () => request('/api/outlook/status'),
  outlookConnect: value => request('/api/outlook/connect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) }),
  outlookDisconnect: () => request('/api/outlook/disconnect', { method: 'POST' }),
  outlookSync: () => request('/api/outlook/sync', { method: 'POST' }),
  mailReviews: () => request('/api/mail-review'),
  confirmMailReview: (id, value) => request(`/api/mail-review/${id}/confirm`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) }),
  dismissMailReview: id => request(`/api/mail-review/${id}/dismiss`, { method: 'POST' }),
  retryOutlook: id => request(`/api/follow-ups/${id}/retry-outlook`, { method: 'POST' }),
};

export function parseCSV(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index], next = text[index + 1];
    if (quoted) {
      if (char === '"' && next === '"') { field += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (char !== '\r') field += char;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const header = rows.shift();
  return rows.filter(values => values.some(Boolean)).map((values, rowIndex) => ({ ...Object.fromEntries(header.map((key, index) => [key, values[index] || ''])), __rowIndex: rowIndex }));
}

export async function readCSV(name) {
  const response = await fetch(`./${name}?t=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${name} 读取失败`);
  return parseCSV(await response.text());
}
