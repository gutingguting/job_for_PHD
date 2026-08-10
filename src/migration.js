const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
  PROJECT_ROOT, DATA_ROOT, AGENT_ROOT, DASHBOARD_DATA_ROOT,
  RESUME_ROOT, RESUME_FILES_ROOT, PROFILE_PATH, PREFERENCES_PATH,
  ONBOARDING_PATH, RESUME_INDEX_PATH,
} = require('./config');
const { ensureDir, readJSON, writeJSON, copyIfMissing, safeFilename } = require('./storage');
const { calculateReadiness } = require('./readiness');
const { refreshCompatibility } = require('./compatibility');

const DASHBOARD_FILES = [
  'application_log.csv', 'automation_rules.csv', 'blocker_queue.csv',
  'daily_dashboard.csv', 'follow_up.csv', 'job_pool.csv', 'resume_rules.csv',
  'postdoc_pipeline.csv',
];
const LEGACY_AGENT_FILES = [
  'answer_bank.md', 'experience_bank.md', 'application_rules.md',
  'resume_routing.md', 'onboarding_status.md',
];

function defaultProfile() {
  return {
    schema_version: 1,
    candidate: {
      legal_name: '', preferred_name: '', english_name: '', email: '', phone: '',
      current_location: '', linkedin_url: '', portfolio_url: '', github_url: '',
    },
    current_status: {
      current_role_or_framing: '', employment_status_answer: '', expected_graduation: '',
      available_start_date: '', notice_period: '',
    },
    education: [],
    work_authorization: {
      target_country_or_region: '', current_authorization: '',
      requires_sponsorship_now: null, requires_sponsorship_in_future: null,
      answer_exactly_as: '',
    },
    targets: {
      primary_role_families: [], secondary_role_families: [], priority_titles: [],
      roles_to_avoid: [], target_industries: [], industries_to_avoid: [],
      target_company_stage: [], target_locations: [],
      remote_hybrid_onsite_preference: '', relocation_policy: '', target_level: '',
    },
    compensation: { base_salary_range: '', total_compensation_range: '', answer_strategy: '', notes: '' },
    voluntary_self_identification: { strategy: 'prefer_not_to_say', fill_automatically: false },
    never_guess: [
      'legal name', 'work authorization', 'sponsorship', 'employment status',
      'salary expectations', 'relocation', 'degree dates', 'employment dates',
      'voluntary self-identification', 'background check or non-compete questions',
    ],
  };
}

function defaultPreferences() {
  return {
    schema_version: 1,
    resume_mode: 'Volume',
    trial_boundary: 'lead_finding_only',
    self_identification_strategy: 'prefer_not_to_say',
    custom_answer_policy: 'draft_first_ask_once_before_reuse',
    final_submission_requires_approval: true,
    application_authorized: false,
    freshness_hours: [24, 48],
    intended_job_boards: [],
    postdoc: {
      enabled: false,
      target_institutions: [],
      research_areas: [],
      opportunity_modes: ['open_position', 'cold_email'],
      funding_preferences: [],
    },
  };
}

function resumeId(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(filePath);
  if (fs.existsSync(filePath)) hash.update(fs.readFileSync(filePath));
  return hash.digest('hex').slice(0, 12);
}

function migrateResumes(profile) {
  if (fs.existsSync(RESUME_INDEX_PATH)) return readJSON(RESUME_INDEX_PATH, []);
  const index = [];
  for (const item of profile.resume_files || []) {
    const source = item.file_path;
    if (!source || !fs.existsSync(source)) continue;
    const id = resumeId(source);
    const originalName = safeFilename(path.basename(source));
    const storedName = `${id}-${originalName}`;
    const destination = path.join(RESUME_FILES_ROOT, storedName);
    copyIfMissing(source, destination);
    index.push({
      id,
      original_name: originalName,
      stored_name: storedName,
      stored_path: path.relative(PROJECT_ROOT, destination).replace(/\\/g, '/'),
      mime_type: path.extname(originalName).toLowerCase() === '.pdf'
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      size: fs.statSync(destination).size,
      version: item.version || originalName,
      role_families: String(item.role_family || '').split(/[、,，/]+/).map(v => v.trim()).filter(Boolean),
      use_when: item.use_when || '',
      archived: false,
      created_at: new Date(fs.statSync(source).mtimeMs).toISOString(),
      source: 'legacy_migration',
    });
  }
  writeJSON(RESUME_INDEX_PATH, index);
  return index;
}

function initializeData() {
  [DATA_ROOT, AGENT_ROOT, DASHBOARD_DATA_ROOT, RESUME_ROOT, RESUME_FILES_ROOT].forEach(ensureDir);

  if (!fs.existsSync(PROFILE_PATH)) {
    const legacy = readJSON(path.join(PROJECT_ROOT, 'candidate_profile.json'), null);
    writeJSON(PROFILE_PATH, legacy || defaultProfile());
  }
  if (!fs.existsSync(PREFERENCES_PATH)) writeJSON(PREFERENCES_PATH, defaultPreferences());
  else {
    const defaults = defaultPreferences();
    const current = readJSON(PREFERENCES_PATH, {});
    writeJSON(PREFERENCES_PATH, {
      ...defaults,
      ...current,
      postdoc: { ...defaults.postdoc, ...(current.postdoc || {}) },
    });
  }

  for (const name of LEGACY_AGENT_FILES) {
    const legacy = path.join(PROJECT_ROOT, name);
    const template = path.join(PROJECT_ROOT, 'templates', name.replace(/\.md$/, '.template.md'));
    copyIfMissing(fs.existsSync(legacy) ? legacy : template, path.join(AGENT_ROOT, name));
  }
  for (const name of DASHBOARD_FILES) {
    const liveSource = path.join(PROJECT_ROOT, 'dashboard', name);
    const templateSource = path.join(PROJECT_ROOT, 'templates', 'dashboard-template', name);
    copyIfMissing(fs.existsSync(liveSource) ? liveSource : templateSource, path.join(DASHBOARD_DATA_ROOT, name));
  }

  const profile = readJSON(PROFILE_PATH, defaultProfile());
  const preferences = readJSON(PREFERENCES_PATH, defaultPreferences());
  const resumes = migrateResumes(profile);
  const readiness = calculateReadiness(profile, preferences, resumes);
  const onboarding = readJSON(ONBOARDING_PATH, {});
  writeJSON(ONBOARDING_PATH, {
    schema_version: 1,
    completed: readiness.lead_finding_ready,
    current_step: readiness.lead_finding_ready ? 6 : Number(onboarding.current_step || 0),
    last_saved_at: onboarding.last_saved_at || new Date().toISOString(),
    readiness,
  });
  refreshCompatibility(profile, preferences, readiness, resumes);
  return { profile, preferences, resumes, readiness };
}

module.exports = { initializeData, defaultProfile, defaultPreferences, DASHBOARD_FILES };
