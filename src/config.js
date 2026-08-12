const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DASHBOARD_ROOT = path.join(PROJECT_ROOT, 'dashboard');
const DATA_ROOT = path.join(PROJECT_ROOT, 'user-data');
const AGENT_ROOT = path.join(DATA_ROOT, 'agent');
const DASHBOARD_DATA_ROOT = path.join(DATA_ROOT, 'dashboard');
const RESUME_ROOT = path.join(DATA_ROOT, 'resumes');
const RESUME_FILES_ROOT = path.join(RESUME_ROOT, 'files');

module.exports = {
  APP_NAME: 'job_for_PHD',
  APP_VERSION: '1.1.0',
  PORT: Number(process.env.JOB_FOR_PHD_PORT || 8420),
  PROJECT_ROOT,
  DASHBOARD_ROOT,
  DATA_ROOT,
  AGENT_ROOT,
  DASHBOARD_DATA_ROOT,
  RESUME_ROOT,
  RESUME_FILES_ROOT,
  PROFILE_PATH: path.join(DATA_ROOT, 'profile.json'),
  PREFERENCES_PATH: path.join(DATA_ROOT, 'preferences.json'),
  ONBOARDING_PATH: path.join(DATA_ROOT, 'onboarding.json'),
  RESUME_INDEX_PATH: path.join(RESUME_ROOT, 'index.json'),
};
