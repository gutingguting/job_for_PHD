const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { classification, mappedField, renderManagedAnswerBank } = require('../src/prefill-service');

const projectRoot = path.resolve(__dirname, '..');

test('prefill privacy filter excludes sensitive identity, credentials and consent', () => {
  assert.equal(classification({ label: '身份证号码', type: 'text' }).excluded, true);
  assert.equal(classification({ label: 'Date of birth', type: 'date' }).excluded, true);
  assert.equal(classification({ label: '短信验证码', type: 'text' }).excluded, true);
  assert.equal(classification({ label: '我同意隐私政策', type: 'checkbox' }).excluded, true);
  assert.equal(classification({ label: '电子邮箱', type: 'email' }).excluded, false);
});

test('prefill semantic mapping prefers exact specific fields', () => {
  assert.equal(mappedField('英文姓名').path, 'candidate.english_name');
  assert.equal(mappedField('请输入电子邮箱').path, 'candidate.email');
  assert.equal(mappedField('当前所在城市').path, 'candidate.current_location');
});

test('managed answer bank section preserves manual content and replaces idempotently', () => {
  const questions = { items: [{ question: '为什么选择我们？', answer: '基于已确认经历。', employer: '示例公司', ats: 'moka', confirmed: true }] };
  const first = renderManagedAnswerBank('# Manual\n\nKeep me.', questions);
  const second = renderManagedAnswerBank(first, questions);
  assert.match(second, /Keep me\./);
  assert.match(second, /为什么选择我们/);
  assert.equal((second.match(/job_for_PHD:prefill:start/g) || []).length, 1);
});

test('extension uses active-tab batch actions and contains no submission action', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, 'extension', 'manifest.json'), 'utf8'));
  const popup = fs.readFileSync(path.join(projectRoot, 'extension', 'popup.js'), 'utf8');
  const content = fs.readFileSync(path.join(projectRoot, 'extension', 'content-script.js'), 'utf8');
  const adapters = fs.readFileSync(path.join(projectRoot, 'extension', 'adapters.js'), 'utf8');
  assert.deepEqual(manifest.permissions, ['activeTab', 'scripting', 'storage']);
  assert.equal(manifest.permissions.includes('cookies'), false);
  assert.match(popup, /pageAction\('extract'\)/);
  assert.match(popup, /pageAction\('fill'/);
  assert.doesNotMatch(content, /(?:click|dispatchEvent)\([^\n]*(?:submit|apply)/i);
  for (const ats of ['moka', 'workday', 'greenhouse']) assert.match(adapters, new RegExp(`${ats}:`));
});

test('dashboard and server expose the v1.3 prefill surfaces', () => {
  const html = fs.readFileSync(path.join(projectRoot, 'dashboard', 'dashboard.html'), 'utf8');
  const server = fs.readFileSync(path.join(projectRoot, 'dashboard', 'server.js'), 'utf8');
  for (const marker of ['prefill-view', 'prefill-pair-btn', 'prefill-facts', 'prefill-questions', 'prefill-imports']) assert.match(html, new RegExp(marker));
  for (const route of ['/api/prefill/pair', '/api/prefill/import', '/api/prefill/resolve-conflicts', '/api/prefill/bundle']) assert.match(server, new RegExp(route.replaceAll('/', '\\/')));
});
