const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DASHBOARD_ROOT = path.join(PROJECT_ROOT, 'dashboard');
const DATA_ROOT = path.join(PROJECT_ROOT, 'user-data');
const AGENT_ROOT = path.join(DATA_ROOT, 'agent');
const DASHBOARD_DATA_ROOT = path.join(DATA_ROOT, 'dashboard');
const RESUME_ROOT = path.join(DATA_ROOT, 'resumes');
const RESUME_FILES_ROOT = path.join(RESUME_ROOT, 'files');
const INTEGRATIONS_ROOT = path.join(DATA_ROOT, 'integrations');
const MAIL_ROOT = path.join(DATA_ROOT, 'mail');
const PREFILL_ROOT = path.join(DATA_ROOT, 'prefill');

module.exports = {
  APP_NAME: 'job_for_PHD',
  APP_VERSION: '1.3.0',
  PORT: Number(process.env.JOB_FOR_PHD_PORT || 8420),
  PROJECT_ROOT,
  DASHBOARD_ROOT,
  DATA_ROOT,
  AGENT_ROOT,
  DASHBOARD_DATA_ROOT,
  RESUME_ROOT,
  RESUME_FILES_ROOT,
  INTEGRATIONS_ROOT,
  MAIL_ROOT,
  PREFILL_ROOT,
  PROFILE_PATH: path.join(DATA_ROOT, 'profile.json'),
  PREFERENCES_PATH: path.join(DATA_ROOT, 'preferences.json'),
  ONBOARDING_PATH: path.join(DATA_ROOT, 'onboarding.json'),
  RESUME_INDEX_PATH: path.join(RESUME_ROOT, 'index.json'),
  OUTLOOK_CONFIG_PATH: path.join(INTEGRATIONS_ROOT, 'outlook.json'),
  OUTLOOK_CACHE_PATH: path.join(INTEGRATIONS_ROOT, 'outlook-token-cache'),
  MAIL_REVIEW_PATH: path.join(MAIL_ROOT, 'review_queue.json'),
  PREFILL_FACTS_PATH: path.join(PREFILL_ROOT, 'facts.json'),
  PREFILL_QUESTIONS_PATH: path.join(PREFILL_ROOT, 'question_bank.json'),
  PREFILL_IMPORTS_PATH: path.join(PREFILL_ROOT, 'imports.json'),
  PREFILL_MAPPINGS_PATH: path.join(PREFILL_ROOT, 'field_mappings.json'),
  PREFILL_PAIRING_PATH: path.join(INTEGRATIONS_ROOT, 'prefill-pairing.json'),
};
