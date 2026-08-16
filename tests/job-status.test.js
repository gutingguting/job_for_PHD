const test = require('node:test');
const assert = require('node:assert/strict');
const { validateJobUpdate, statusReason } = require('../src/job-service');

test('Submitted requires a real date and confirmation evidence', () => {
  assert.throws(() => validateJobUpdate({ status: 'Pending' }, { status: 'Submitted' }), /actual submission date/);
  assert.throws(() => validateJobUpdate({ status: 'Pending' }, { status: 'Submitted', submission_date: '2026-08-16' }), /confirmation evidence/);
  assert.doesNotThrow(() => validateJobUpdate({ status: 'Pending' }, { status: 'Submitted', submission_date: '2026-08-16', submission_evidence: 'Confirmation ID 123' }));
});

test('reason-bearing statuses reject empty reasons', () => {
  for (const status of ['Needs user', 'Skipped', 'Blocked']) {
    assert.throws(() => validateJobUpdate({ status: 'Pending' }, { status }), /requires a reason/);
  }
  assert.equal(statusReason('Skipped', { reason: '不符合特别需求' }), '不符合特别需求');
});

