const path = require('path');
const { AGENT_ROOT } = require('./config');
const { atomicWrite, writeJSON } = require('./storage');

function bullets(values, empty = '未配置') {
  return Array.isArray(values) && values.length ? values.map(v => `- ${v}`).join('\n') : `- ${empty}`;
}

function refreshCompatibility(profile, preferences, readiness, resumeIndex) {
  writeJSON(path.join(AGENT_ROOT, 'candidate_profile.json'), {
    ...profile,
    profile_status: readiness.state,
    last_updated: new Date().toISOString().slice(0, 10),
  });

  const targets = profile.targets || {};
  const auth = profile.work_authorization || {};
  const rules = `# job_for_PHD Application Rules

Status: ${readiness.state}. Final submission requires explicit user approval.

## Mode

- Resume mode: **${preferences.resume_mode || 'Volume'}**
- Trial boundary: **${preferences.trial_boundary || 'lead_finding_only'}**
- Application authorized: **${preferences.application_authorized === true ? 'yes' : 'no'}**

## Prioritize

${bullets(targets.primary_role_families)}

## Avoid

${bullets(targets.roles_to_avoid)}

## Location

${bullets(targets.target_locations)}

## Work authorization

- ${auth.answer_exactly_as || auth.current_authorization || '未配置；必须询问用户'}

## Safety boundary

- Do not open an application form, click Apply, or submit without the user-authorized workflow stage.
- Always stop before final submission and request explicit approval.
- Never guess identity, authorization, sponsorship, compensation, degree dates, or voluntary self-identification.
`;
  atomicWrite(path.join(AGENT_ROOT, 'application_rules.md'), rules);

  const routingRows = resumeIndex
    .filter(item => !item.archived)
    .map(item => `| ${item.version || item.original_name} | ${(item.role_families || []).join('、')} | ${item.use_when || ''} | ${item.stored_path} |`)
    .join('\n');
  atomicWrite(path.join(AGENT_ROOT, 'resume_routing.md'), `# job_for_PHD Resume Routing

| Version | Role families | Use when | Private file |
|---|---|---|---|
${routingRows || '| 未配置 |  |  |  |'}

Never overwrite a source resume. Create a versioned copy for every tailored resume.
`);

  atomicWrite(path.join(AGENT_ROOT, 'onboarding_status.md'), `# job_for_PHD Onboarding Status

- State: ${readiness.state}
- Lead finding ready: ${readiness.lead_finding_ready}
- Application facts ready: ${readiness.application_facts_ready}
- Application authorized: ${readiness.application_authorized}
- Missing lead fields: ${readiness.missing.lead_finding.join(', ') || 'none'}
- Missing application fields: ${readiness.missing.application.join(', ') || 'none'}
`);
}

module.exports = { refreshCompatibility };
