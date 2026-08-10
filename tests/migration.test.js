const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { initializeData } = require('../src/migration');
const { PROFILE_PATH, PREFERENCES_PATH, RESUME_INDEX_PATH, DASHBOARD_DATA_ROOT } = require('../src/config');

test('data initialization is idempotent and preserves the private resume index', () => {
  const first = initializeData();
  const before = fs.readFileSync(RESUME_INDEX_PATH, 'utf8');
  const second = initializeData();
  const after = fs.readFileSync(RESUME_INDEX_PATH, 'utf8');
  assert.equal(before, after);
  assert.ok(fs.existsSync(PROFILE_PATH));
  assert.ok(fs.existsSync(PREFERENCES_PATH));
  assert.ok(fs.existsSync(`${DASHBOARD_DATA_ROOT}/postdoc_pipeline.csv`));
  assert.equal(first.readiness.lead_finding_ready, second.readiness.lead_finding_ready);
});
