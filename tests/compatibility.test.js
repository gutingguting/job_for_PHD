const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { refreshCompatibility } = require('../src/compatibility');
const { AGENT_ROOT } = require('../src/config');

test('agent application rules expose postdoc preferences as strict constraints', () => {
  const names = ['candidate_profile.json', 'application_rules.md', 'resume_routing.md', 'onboarding_status.md'];
  const backups = new Map(names.map(name => {
    const file = path.join(AGENT_ROOT, name);
    return [file, fs.existsSync(file) ? fs.readFileSync(file) : null];
  }));
  try {
    refreshCompatibility({ targets: { special_requirements: '不得投文职；优先医疗电子。' }, work_authorization: {} }, {
      postdoc: {
        enabled: true,
        research_areas: ['质子治疗的电子学相关岗位'],
        target_institutions: ['PSI'],
      },
    }, { state: 'ready', lead_finding_ready: true, application_facts_ready: false, application_authorized: false, missing: { lead_finding: [], application: [] } }, []);
    const rules = fs.readFileSync(path.join(AGENT_ROOT, 'application_rules.md'), 'utf8');
    assert.match(rules, /Matching policy: \*\*strict allowlist\*\*/);
    assert.match(rules, /质子治疗的电子学相关岗位/);
    assert.match(rules, /- PSI/);
    assert.match(rules, /adjacent fields do not count as a match/);
    assert.match(rules, /不得投文职；优先医疗电子。/);
  } finally {
    for (const [file, content] of backups) {
      if (content === null) fs.rmSync(file, { force: true });
      else fs.writeFileSync(file, content);
    }
  }
});
