const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');

test('postdoc frontend tolerates a legacy API response without policy', () => {
  const source = fs.readFileSync(path.join(projectRoot, 'dashboard', 'postdoc.js'), 'utf8');
  assert.match(source, /response\.policy \|\| \{ enabled: false, research_areas: \[\], target_institutions: \[\] \}/);
});

test('dashboard frontend version matches the server application version', () => {
  const frontend = fs.readFileSync(path.join(projectRoot, 'dashboard', 'dashboard-app.js'), 'utf8');
  const config = fs.readFileSync(path.join(projectRoot, 'src', 'config.js'), 'utf8');
  const frontendVersion = frontend.match(/FRONTEND_VERSION = '([^']+)'/)?.[1];
  const backendVersion = config.match(/APP_VERSION: '([^']+)'/)?.[1];
  assert.equal(frontendVersion, backendVersion);
});
