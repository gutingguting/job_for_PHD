const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function listHasValue(value) {
  return Array.isArray(value) && value.some(nonEmpty);
}

function calculateReadiness(profile = {}, preferences = {}, resumes = []) {
  const candidate = profile.candidate || {};
  const status = profile.current_status || {};
  const auth = profile.work_authorization || {};
  const targets = profile.targets || {};
  const activeResumes = resumes.filter(item => !item.archived);

  const leadChecks = {
    resume: activeResumes.length > 0 || (Array.isArray(profile.resume_files) && profile.resume_files.length > 0),
    target_roles: listHasValue(targets.primary_role_families),
    target_locations: listHasValue(targets.target_locations),
    work_authorization: nonEmpty(auth.current_authorization) || nonEmpty(auth.answer_exactly_as),
    roles_to_avoid: Array.isArray(targets.roles_to_avoid),
  };

  const applicationChecks = {
    legal_name: nonEmpty(candidate.legal_name),
    email: nonEmpty(candidate.email) && EMAIL_RE.test(candidate.email),
    phone: nonEmpty(candidate.phone),
    available_start_date: nonEmpty(status.available_start_date),
    resume_routing: activeResumes.some(item => listHasValue(item.role_families)),
    authorization_confirmed:
      typeof auth.requires_sponsorship_now === 'boolean' &&
      typeof auth.requires_sponsorship_in_future === 'boolean',
    final_submission_requires_approval: preferences.final_submission_requires_approval === true,
  };

  const missingLead = Object.entries(leadChecks).filter(([, ok]) => !ok).map(([key]) => key);
  const missingApplication = Object.entries(applicationChecks).filter(([, ok]) => !ok).map(([key]) => key);
  const leadReady = missingLead.length === 0;
  const factsReadyForApplication = leadReady && missingApplication.length === 0;

  return {
    state: leadReady ? (factsReadyForApplication ? 'application_facts_ready' : 'lead_finding_ready') : 'incomplete',
    lead_finding_ready: leadReady,
    application_ready: factsReadyForApplication && preferences.application_authorized === true,
    application_facts_ready: factsReadyForApplication,
    application_authorized: preferences.application_authorized === true,
    missing: { lead_finding: missingLead, application: missingApplication },
    checks: { lead: leadChecks, application: applicationChecks },
  };
}

function validateProfile(profile) {
  const errors = [];
  const candidate = profile && profile.candidate;
  if (!candidate || typeof candidate !== 'object') errors.push({ field: 'candidate', message: '候选人资料格式无效' });
  if (candidate && candidate.email && !EMAIL_RE.test(candidate.email)) {
    errors.push({ field: 'candidate.email', message: '邮箱格式不正确' });
  }
  for (const key of ['requires_sponsorship_now', 'requires_sponsorship_in_future']) {
    const value = profile?.work_authorization?.[key];
    if (![true, false, null, undefined].includes(value)) {
      errors.push({ field: `work_authorization.${key}`, message: '该字段只能是是、否或未确定' });
    }
  }
  return errors;
}

module.exports = { calculateReadiness, validateProfile };
