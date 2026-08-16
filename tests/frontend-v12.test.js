const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'dashboard', 'dashboard.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'dashboard', 'dashboard-app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'dashboard', 'styles.css'), 'utf8');

test('v1.2 dashboard exposes special requirements, Outlook review, and job status controls', () => {
  assert.match(html, /targets\.special_requirements/);
  assert.match(html, /id="outlook-connect-form"/);
  assert.match(html, /id="mail-review-list"/);
  assert.match(html, /id="job-status-dialog"/);
  assert.match(app, /data-job-status/);
  assert.match(app, /confirmMailReview/);
});

test('new interactive surfaces include responsive narrow-screen layouts', () => {
  assert.match(css, /\.mail-review-form/);
  assert.match(css, /\.job-controls/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*\.integration-connect/);
});

