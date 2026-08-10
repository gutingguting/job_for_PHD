const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateReadiness, validateProfile } = require('../src/readiness');

function completeState() {
  return {
    profile: {
      candidate: { legal_name: 'Test Candidate', email: 'candidate@example.test', phone: '+86 13800000000' },
      current_status: { available_start_date: '2027-06' },
      work_authorization: { current_authorization: 'Authorized', requires_sponsorship_now: false, requires_sponsorship_in_future: false },
      targets: { primary_role_families: ['FPGA'], target_locations: ['Beijing'], roles_to_avoid: [] },
    },
    preferences: { final_submission_requires_approval: true, application_authorized: false },
    resumes: [{ id: 'one', role_families: ['FPGA'], archived: false }],
  };
}

test('minimum facts produce lead-ready state without authorizing applications', () => {
  const value = completeState();
  const result = calculateReadiness(value.profile, value.preferences, value.resumes);
  assert.equal(result.lead_finding_ready, true);
  assert.equal(result.application_facts_ready, true);
  assert.equal(result.application_ready, false);
  assert.equal(result.state, 'application_facts_ready');
});

test('missing target roles blocks lead finding readiness', () => {
  const value = completeState();
  value.profile.targets.primary_role_families = [];
  const result = calculateReadiness(value.profile, value.preferences, value.resumes);
  assert.equal(result.lead_finding_ready, false);
  assert.ok(result.missing.lead_finding.includes('target_roles'));
});

test('archived resumes do not satisfy resume routing', () => {
  const value = completeState();
  value.resumes[0].archived = true;
  const result = calculateReadiness(value.profile, value.preferences, value.resumes);
  assert.equal(result.lead_finding_ready, false);
});

test('profile validation identifies invalid email and sponsorship type', () => {
  const errors = validateProfile({ candidate: { email: 'bad-email' }, work_authorization: { requires_sponsorship_now: 'no' } });
  assert.deepEqual(errors.map(error => error.field), ['candidate.email', 'work_authorization.requires_sponsorship_now']);
});
