// Local-only server for job_for_PHD. It serves the dashboard and keeps all
// candidate files under the git-ignored user-data directory.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Busboy = require('busboy');
const {
  APP_NAME, APP_VERSION, PORT, PROJECT_ROOT, DASHBOARD_ROOT, DATA_ROOT,
  DASHBOARD_DATA_ROOT, RESUME_FILES_ROOT, PROFILE_PATH, PREFERENCES_PATH,
  ONBOARDING_PATH, RESUME_INDEX_PATH,
} = require('../src/config');
const { initializeData } = require('../src/migration');
const { calculateReadiness, validateProfile } = require('../src/readiness');
const { refreshCompatibility } = require('../src/compatibility');
const { readJSON, writeJSON, safeFilename } = require('../src/storage');
const { parseResume } = require('../src/resume-parser');
const { parseCSV, stringifyCSV, readCSVRows, writeCSVRows } = require('../src/csv');
const { postdocPolicy, validatePostdocPreferences, validatePostdocRecord } = require('../src/postdoc-policy');
const { JOB_STATUSES, updateJob } = require('../src/job-service');
const outlook = require('../src/outlook-service');
const prefill = require('../src/prefill-service');

const MAX_JSON_BYTES = 1024 * 1024;
const MAX_RESUME_BYTES = 10 * 1024 * 1024;
const JOB_POOL_PATH = path.join(DASHBOARD_DATA_ROOT, 'job_pool.csv');
const FOLLOW_UP_PATH = path.join(DASHBOARD_DATA_ROOT, 'follow_up.csv');
const POSTDOC_PATH = path.join(DASHBOARD_DATA_ROOT, 'postdoc_pipeline.csv');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.csv': 'text/csv; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.ico': 'image/x-icon',
};

initializeData();

function sendJSON(res, status, value) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY',
  });
  res.end(JSON.stringify(value));
}

function sendError(res, status, message, details) {
  sendJSON(res, status, { ok: false, error: message, details });
}

function extensionId(req) {
  const match = String(req.headers.origin || '').match(/^chrome-extension:\/\/([a-z]+)$/i);
  return match?.[1] || '';
}

function bearerToken(req) {
  const match = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
  return match?.[1] || '';
}

function requirePrefillExtension(req) {
  const id = extensionId(req);
  if (!id || !prefill.verifyToken(bearerToken(req), id)) {
    throw Object.assign(new Error('预填写扩展尚未配对或令牌已过期'), { status: 401 });
  }
}

function readJSONBody(req, maxBytes = MAX_JSON_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(Object.assign(new Error('Request body is too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch { reject(Object.assign(new Error('Invalid JSON body'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

function loadState() {
  const profile = readJSON(PROFILE_PATH, {});
  const preferences = readJSON(PREFERENCES_PATH, {});
  const resumes = readJSON(RESUME_INDEX_PATH, []);
  const readiness = calculateReadiness(profile, preferences, resumes);
  return { profile, preferences, resumes, readiness };
}

function persistDerived(state, onboardingPatch = {}) {
  const onboarding = readJSON(ONBOARDING_PATH, {});
  writeJSON(ONBOARDING_PATH, {
    ...onboarding,
    ...onboardingPatch,
    readiness: state.readiness,
    last_saved_at: new Date().toISOString(),
  });
  refreshCompatibility(state.profile, state.preferences, state.readiness, state.resumes);
}

function locateJobRow(jobRowIndex, company, jobTitle) {
  if (!Number.isInteger(jobRowIndex) || jobRowIndex < 0) throw Object.assign(new Error('jobRowIndex must be a non-negative integer'), { status: 400 });
  const { header, dataRows } = readCSVRows(JOB_POOL_PATH);
  const companyCol = header.indexOf('company');
  const titleCol = header.indexOf('job_title');
  const statusCol = header.indexOf('status');
  const stageCol = header.indexOf('current_stage');
  if ([companyCol, titleCol, statusCol, stageCol].includes(-1)) throw Object.assign(new Error('job_pool.csv is missing expected columns'), { status: 500 });
  const target = dataRows[jobRowIndex];
  if (!target || target[companyCol] !== company || target[titleCol] !== jobTitle) throw Object.assign(new Error('Dashboard data changed; refresh and try again'), { status: 409 });
  return { header, dataRows, statusCol, stageCol, target };
}

async function updateStatus(req, res) {
  const body = await readJSONBody(req);
  if (!['Offer', 'Rejected'].includes(body.status)) return sendError(res, 400, 'status must be Offer or Rejected');
  const job = locateJobRow(body.rowIndex, body.company, body.job_title);
  const id = job.target[job.header.indexOf('id')];
  sendJSON(res, 200, { ok: true, job: updateJob(id, { status: body.status }) });
}

async function patchJob(req, res, id) {
  const body = await readJSONBody(req);
  sendJSON(res, 200, { ok: true, job: updateJob(id, body), statuses: JOB_STATUSES });
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

async function calendarAdd(req, res) {
  const body = await readJSONBody(req);
  if (!DATE_RE.test(body.date) || !TIME_RE.test(body.time) || !String(body.event_type || '').trim()) return sendError(res, 400, 'Date, time and event content are required');
  const job = locateJobRow(body.jobRowIndex, body.company, body.job_title);
  if (job.target[job.statusCol] !== 'Submitted') return sendError(res, 409, 'Calendar events are only available for submitted jobs');
  const { header, dataRows } = readCSVRows(FOLLOW_UP_PATH);
  const row = new Array(header.length).fill('');
  const set = (name, value) => { const col = header.indexOf(name); if (col >= 0) row[col] = value; };
  set('date', body.date); set('time', body.time); set('company', body.company);
  set('job_title', body.job_title); set('event_type', body.event_type.trim()); set('status', 'Scheduled');
  set('id', crypto.randomUUID()); set('pipeline_type', 'job'); set('record_id', job.target[job.header.indexOf('id')]);
  set('timezone', Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai'); set('outlook_sync_status', 'not_requested');
  dataRows.push(row);
  job.target[job.stageCol] = body.event_type.trim();
  writeCSVRows(FOLLOW_UP_PATH, header, dataRows);
  writeCSVRows(JOB_POOL_PATH, job.header, job.dataRows);
  sendJSON(res, 200, { ok: true, followUpRowIndex: dataRows.length - 1, current_stage: body.event_type.trim() });
}

async function calendarUpdate(req, res) {
  const body = await readJSONBody(req);
  if (!Number.isInteger(body.followUpRowIndex) || !DATE_RE.test(body.date) || !TIME_RE.test(body.time) || !String(body.event_type || '').trim()) return sendError(res, 400, 'Invalid calendar event');
  const { header, dataRows } = readCSVRows(FOLLOW_UP_PATH);
  const target = dataRows[body.followUpRowIndex];
  if (!target || target[header.indexOf('company')] !== body.company || target[header.indexOf('job_title')] !== body.job_title) return sendError(res, 409, 'Calendar data changed; refresh and try again');
  const job = locateJobRow(body.jobRowIndex, body.company, body.job_title);
  for (const [key, value] of [['date', body.date], ['time', body.time], ['event_type', body.event_type.trim()]]) target[header.indexOf(key)] = value;
  job.target[job.stageCol] = body.event_type.trim();
  writeCSVRows(FOLLOW_UP_PATH, header, dataRows);
  writeCSVRows(JOB_POOL_PATH, job.header, job.dataRows);
  sendJSON(res, 200, { ok: true, current_stage: body.event_type.trim() });
}

async function calendarDelete(req, res) {
  const body = await readJSONBody(req);
  if (!Number.isInteger(body.followUpRowIndex)) return sendError(res, 400, 'Invalid calendar event');
  const { header, dataRows } = readCSVRows(FOLLOW_UP_PATH);
  const target = dataRows[body.followUpRowIndex];
  const matches = (key, value) => target && target[header.indexOf(key)] === value;
  if (!matches('company', body.company) || !matches('job_title', body.job_title) || !matches('date', body.date) || !matches('time', body.time) || !matches('event_type', body.event_type)) return sendError(res, 409, 'Calendar data changed; refresh and try again');
  dataRows.splice(body.followUpRowIndex, 1);
  writeCSVRows(FOLLOW_UP_PATH, header, dataRows);
  sendJSON(res, 200, { ok: true });
}

const POSTDOC_COLUMNS = [
  'id', 'pi_group', 'institute', 'country_region', 'matched_research_area',
  'matched_target_institution', 'research_fit', 'funding_status',
  'opportunity_type', 'position_title', 'source_url', 'status', 'contacted_date',
  'reply_summary', 'interview_date', 'research_statement_status',
  'reference_letters_status', 'follow_up_date', 'next_action', 'notes', 'last_verified',
];
const POSTDOC_STATUSES = ['Prospect', 'Open position', 'Cold email planned', 'Contacted', 'Replied', 'Interview', 'Offer', 'Closed'];

function postdocsAsObjects() {
  const { header, dataRows } = readCSVRows(POSTDOC_PATH);
  const preferences = readJSON(PREFERENCES_PATH, {});
  return dataRows.map(row => {
    const record = Object.fromEntries(header.map((key, index) => [key, row[index] || '']));
    const policyErrors = validatePostdocRecord(record, preferences);
    return { ...record, policy_compliant: policyErrors.length === 0, policy_errors: policyErrors };
  });
}

async function createPostdoc(req, res) {
  const body = await readJSONBody(req);
  if (!String(body.institute || '').trim()) return sendError(res, 422, 'Institute is required');
  const policyErrors = validatePostdocRecord(body, readJSON(PREFERENCES_PATH, {}));
  if (policyErrors.length) return sendError(res, 422, 'Postdoc preference constraints failed', policyErrors);
  const { header, dataRows } = readCSVRows(POSTDOC_PATH);
  const record = { ...body, id: crypto.randomUUID(), status: POSTDOC_STATUSES.includes(body.status) ? body.status : 'Prospect' };
  const row = header.map(key => String(record[key] ?? '').trim());
  dataRows.push(row);
  writeCSVRows(POSTDOC_PATH, header, dataRows);
  sendJSON(res, 201, { ok: true, postdoc: Object.fromEntries(header.map((key, index) => [key, row[index]])) });
}

async function updatePostdoc(req, res, id) {
  const body = await readJSONBody(req);
  const statusOnly = Object.keys(body).every(key => key === 'status');
  const { header, dataRows } = readCSVRows(POSTDOC_PATH);
  const idCol = header.indexOf('id');
  const row = dataRows.find(item => item[idCol] === id);
  if (!row) return sendError(res, 404, 'Postdoc record not found');
  const existing = Object.fromEntries(header.map((key, index) => [key, row[index] || '']));
  const nextRecord = { ...existing, ...body };
  if (!statusOnly) {
    const policyErrors = validatePostdocRecord(nextRecord, readJSON(PREFERENCES_PATH, {}));
    if (policyErrors.length) return sendError(res, 422, 'Postdoc preference constraints failed', policyErrors);
  }
  for (const key of POSTDOC_COLUMNS) {
    if (key === 'id' || !(key in body)) continue;
    if (key === 'status' && !POSTDOC_STATUSES.includes(body[key])) return sendError(res, 422, 'Invalid postdoc status');
    row[header.indexOf(key)] = String(body[key] ?? '').trim();
  }
  writeCSVRows(POSTDOC_PATH, header, dataRows);
  sendJSON(res, 200, { ok: true, postdoc: Object.fromEntries(header.map((key, index) => [key, row[index] || ''])) });
}

async function putProfile(req, res) {
  const profile = await readJSONBody(req);
  profile.targets ||= {};
  profile.targets.special_requirements = String(profile.targets.special_requirements || '').trim();
  if (profile.targets.special_requirements.length > 4000) return sendError(res, 422, 'Special requirements must be 4000 characters or fewer');
  const errors = validateProfile(profile);
  if (errors.length) return sendError(res, 422, 'Profile validation failed', errors);
  writeJSON(PROFILE_PATH, { ...profile, schema_version: 2, last_updated: new Date().toISOString().slice(0, 10) });
  const state = loadState();
  persistDerived(state);
  sendJSON(res, 200, { ok: true, profile: state.profile, readiness: state.readiness });
}

async function putPreferences(req, res) {
  const update = await readJSONBody(req);
  const current = readJSON(PREFERENCES_PATH, {});
  const preferences = { ...current, ...update, schema_version: 2 };
  preferences.postdoc = { ...(current.postdoc || {}), ...(update.postdoc || {}), match_policy: 'strict' };
  preferences.application_authorized = false;
  preferences.final_submission_requires_approval = true;
  const postdocErrors = validatePostdocPreferences(preferences);
  if (postdocErrors.length) return sendError(res, 422, 'Postdoc preference validation failed', postdocErrors);
  writeJSON(PREFERENCES_PATH, preferences);
  const state = loadState();
  persistDerived(state);
  sendJSON(res, 200, { ok: true, preferences: state.preferences, readiness: state.readiness });
}

async function completeOnboarding(req, res) {
  await readJSONBody(req);
  const state = loadState();
  persistDerived(state, { completed: state.readiness.lead_finding_ready, current_step: state.readiness.lead_finding_ready ? 6 : 0 });
  if (!state.readiness.lead_finding_ready) return sendError(res, 422, 'Minimum setup is incomplete', state.readiness.missing.lead_finding);
  sendJSON(res, 200, { ok: true, readiness: state.readiness });
}

async function saveOnboarding(req, res) {
  const body = await readJSONBody(req);
  const currentStep = Number(body.current_step);
  if (!Number.isInteger(currentStep) || currentStep < 0 || currentStep > 6) return sendError(res, 422, 'current_step must be between 0 and 6');
  const state = loadState();
  persistDerived(state, { current_step: currentStep, completed: state.readiness.lead_finding_ready });
  sendJSON(res, 200, { ok: true, onboarding: readJSON(ONBOARDING_PATH, {}), readiness: state.readiness });
}

function inspectMagic(filePath, ext) {
  const fd = fs.openSync(filePath, 'r');
  const buffer = Buffer.alloc(5);
  fs.readSync(fd, buffer, 0, 5, 0);
  fs.closeSync(fd);
  if (ext === '.pdf') return buffer.subarray(0, 5).toString() === '%PDF-';
  if (ext === '.docx') return buffer[0] === 0x50 && buffer[1] === 0x4b;
  return false;
}

function uploadResume(req, res) {
  let busboy;
  try { busboy = Busboy({ headers: req.headers, limits: { files: 1, fileSize: MAX_RESUME_BYTES, fields: 10 } }); }
  catch { return sendError(res, 400, 'Expected multipart/form-data'); }

  const fields = {};
  let upload = null;
  let failed = null;
  busboy.on('field', (name, value) => { fields[name] = value.slice(0, 1000); });
  busboy.on('file', (name, stream, info) => {
    if (name !== 'resume') { stream.resume(); return; }
    const originalName = safeFilename(info.filename);
    const ext = path.extname(originalName).toLowerCase();
    const allowedMime = ext === '.pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if (!['.pdf', '.docx'].includes(ext) || (info.mimeType && info.mimeType !== allowedMime && info.mimeType !== 'application/octet-stream')) {
      failed = 'Only genuine DOCX and PDF resumes are accepted'; stream.resume(); return;
    }
    const id = crypto.randomUUID();
    const storedName = `${id}-${originalName}`;
    const tempPath = path.join(RESUME_FILES_ROOT, `${storedName}.uploading`);
    const destination = path.join(RESUME_FILES_ROOT, storedName);
    const writer = fs.createWriteStream(tempPath, { flags: 'wx' });
    const writeDone = new Promise((resolve, reject) => {
      writer.on('close', resolve);
      writer.on('error', reject);
      stream.on('error', reject);
    });
    upload = { id, originalName, storedName, tempPath, destination, ext, mimeType: allowedMime, truncated: false, writeDone };
    stream.on('limit', () => { upload.truncated = true; });
    stream.pipe(writer);
  });
  busboy.on('error', error => sendError(res, 400, error.message));
  busboy.on('finish', async () => {
    try {
      if (failed || !upload) throw Object.assign(new Error(failed || 'Resume file is required'), { status: 400 });
      await upload.writeDone;
      if (upload.truncated) throw Object.assign(new Error('Resume exceeds the 10 MB limit'), { status: 413 });
      if (!inspectMagic(upload.tempPath, upload.ext)) throw Object.assign(new Error('File contents do not match the selected type'), { status: 415 });
      fs.renameSync(upload.tempPath, upload.destination);
      const parsed = await parseResume(upload.destination, upload.originalName);
      const index = readJSON(RESUME_INDEX_PATH, []);
      const item = {
        id: upload.id, original_name: upload.originalName, stored_name: upload.storedName,
        stored_path: path.relative(PROJECT_ROOT, upload.destination).replace(/\\/g, '/'),
        mime_type: upload.mimeType, size: fs.statSync(upload.destination).size,
        version: String(fields.version || upload.originalName).trim(),
        role_families: String(fields.role_families || '').split(/[、,，/]+/).map(v => v.trim()).filter(Boolean),
        use_when: String(fields.use_when || '').trim(), archived: false,
        created_at: new Date().toISOString(), source: 'dashboard_upload',
      };
      index.push(item);
      writeJSON(RESUME_INDEX_PATH, index);
      const state = loadState();
      persistDerived(state);
      sendJSON(res, 201, { ok: true, resume: item, suggestions: parsed });
    } catch (error) {
      for (const candidate of [upload?.tempPath, upload?.destination]) {
        if (candidate && fs.existsSync(candidate) && !readJSON(RESUME_INDEX_PATH, []).some(item => item.stored_name === path.basename(candidate))) fs.rmSync(candidate, { force: true });
      }
      sendError(res, error.status || 500, error.message);
    }
  });
  req.pipe(busboy);
}

async function patchResume(req, res, id) {
  const update = await readJSONBody(req);
  const index = readJSON(RESUME_INDEX_PATH, []);
  const item = index.find(entry => entry.id === id);
  if (!item) return sendError(res, 404, 'Resume not found');
  if ('version' in update) item.version = String(update.version).trim().slice(0, 120);
  if ('role_families' in update) item.role_families = Array.isArray(update.role_families) ? update.role_families.map(String).map(v => v.trim()).filter(Boolean) : [];
  if ('use_when' in update) item.use_when = String(update.use_when).trim().slice(0, 1000);
  writeJSON(RESUME_INDEX_PATH, index);
  const state = loadState(); persistDerived(state);
  sendJSON(res, 200, { ok: true, resume: item, readiness: state.readiness });
}

function archiveResume(res, id) {
  const index = readJSON(RESUME_INDEX_PATH, []);
  const item = index.find(entry => entry.id === id);
  if (!item) return sendError(res, 404, 'Resume not found');
  item.archived = true; item.archived_at = new Date().toISOString();
  writeJSON(RESUME_INDEX_PATH, index);
  const state = loadState(); persistDerived(state);
  sendJSON(res, 200, { ok: true, readiness: state.readiness });
}

async function routeApi(req, res, urlPath) {
  const state = () => loadState();
  if (req.method === 'GET' && urlPath === '/api/health') return sendJSON(res, 200, { ok: true, app: APP_NAME, version: APP_VERSION, data_directory: path.relative(PROJECT_ROOT, DATA_ROOT), readiness: state().readiness });
  if (req.method === 'GET' && urlPath === '/api/profile') { const value = state(); return sendJSON(res, 200, { ok: true, profile: value.profile, readiness: value.readiness }); }
  if (req.method === 'PUT' && urlPath === '/api/profile') return putProfile(req, res);
  if (req.method === 'GET' && urlPath === '/api/preferences') { const value = state(); return sendJSON(res, 200, { ok: true, preferences: value.preferences, readiness: value.readiness }); }
  if (req.method === 'PUT' && urlPath === '/api/preferences') return putPreferences(req, res);
  if (req.method === 'GET' && urlPath === '/api/onboarding') { const value = state(); return sendJSON(res, 200, { ok: true, onboarding: readJSON(ONBOARDING_PATH, {}), readiness: value.readiness }); }
  if (req.method === 'PUT' && urlPath === '/api/onboarding') return saveOnboarding(req, res);
  if (req.method === 'POST' && urlPath === '/api/onboarding/complete') return completeOnboarding(req, res);
  if (req.method === 'GET' && urlPath === '/api/resumes') { const value = state(); return sendJSON(res, 200, { ok: true, resumes: value.resumes, readiness: value.readiness }); }
  if (req.method === 'POST' && urlPath === '/api/resumes') return uploadResume(req, res);
  const resumeMatch = urlPath.match(/^\/api\/resumes\/([a-f0-9-]+)$/i);
  if (req.method === 'PATCH' && resumeMatch) return patchResume(req, res, resumeMatch[1]);
  const archiveMatch = urlPath.match(/^\/api\/resumes\/([a-f0-9-]+)\/archive$/i);
  if (req.method === 'POST' && archiveMatch) return archiveResume(res, archiveMatch[1]);
  if (req.method === 'GET' && urlPath === '/api/postdocs') return sendJSON(res, 200, { ok: true, postdocs: postdocsAsObjects(), statuses: POSTDOC_STATUSES, policy: postdocPolicy(state().preferences) });
  if (req.method === 'POST' && urlPath === '/api/postdocs') return createPostdoc(req, res);
  const postdocMatch = urlPath.match(/^\/api\/postdocs\/([a-f0-9-]+)$/i);
  if (req.method === 'PUT' && postdocMatch) return updatePostdoc(req, res, postdocMatch[1]);
  const jobMatch = urlPath.match(/^\/api\/jobs\/([a-f0-9-]+)$/i);
  if (req.method === 'PATCH' && jobMatch) return patchJob(req, res, jobMatch[1]);
  if (req.method === 'POST' && urlPath === '/api/update-status') return updateStatus(req, res);
  if (req.method === 'POST' && urlPath === '/api/calendar/add') return calendarAdd(req, res);
  if (req.method === 'POST' && urlPath === '/api/calendar/update') return calendarUpdate(req, res);
  if (req.method === 'POST' && urlPath === '/api/calendar/delete') return calendarDelete(req, res);
  if (req.method === 'GET' && urlPath === '/api/outlook/status') return sendJSON(res, 200, { ok: true, outlook: outlook.status() });
  if (req.method === 'POST' && urlPath === '/api/outlook/connect') return sendJSON(res, 200, { ok: true, ...(await outlook.beginConnect(await readJSONBody(req))) });
  if (req.method === 'POST' && urlPath === '/api/outlook/disconnect') return sendJSON(res, 200, { ok: true, outlook: await outlook.disconnect() });
  if (req.method === 'POST' && urlPath === '/api/outlook/sync') return sendJSON(res, 200, { ok: true, result: await outlook.sync(), outlook: outlook.status() });
  if (req.method === 'GET' && urlPath === '/api/mail-review') return sendJSON(res, 200, { ok: true, reviews: outlook.reviews() });
  const reviewConfirm = urlPath.match(/^\/api\/mail-review\/([a-f0-9-]+)\/confirm$/i);
  if (req.method === 'POST' && reviewConfirm) return sendJSON(res, 200, { ok: true, ...(await outlook.confirmReview(reviewConfirm[1], await readJSONBody(req))) });
  const reviewDismiss = urlPath.match(/^\/api\/mail-review\/([a-f0-9-]+)\/dismiss$/i);
  if (req.method === 'POST' && reviewDismiss) return sendJSON(res, 200, { ok: true, review: outlook.dismissReview(reviewDismiss[1]) });
  const retryOutlook = urlPath.match(/^\/api\/follow-ups\/([a-f0-9-]+)\/retry-outlook$/i);
  if (req.method === 'POST' && retryOutlook) return sendJSON(res, 200, { ok: true, event: await outlook.retryFollowUp(retryOutlook[1]) });
  if (req.method === 'POST' && urlPath === '/api/prefill/pair') {
    const body = await readJSONBody(req);
    if (body.action === 'create') {
      if (extensionId(req)) return sendError(res, 403, '扩展不能创建配对码');
      return sendJSON(res, 200, { ok: true, pairing: prefill.createPairingCode() });
    }
    if (body.action === 'exchange') {
      const id = extensionId(req);
      if (!id) return sendError(res, 403, '只能从浏览器扩展完成配对');
      return sendJSON(res, 200, { ok: true, pairing: prefill.exchangePairingCode(body.code, id) });
    }
    return sendError(res, 400, '未知配对操作');
  }
  if (req.method === 'GET' && urlPath === '/api/prefill') return sendJSON(res, 200, { ok: true, ...prefill.readState() });
  if (req.method === 'PUT' && urlPath === '/api/prefill') return sendJSON(res, 200, { ok: true, ...prefill.updateState(await readJSONBody(req)) });
  if (req.method === 'POST' && urlPath === '/api/prefill/import') {
    requirePrefillExtension(req);
    return sendJSON(res, 201, { ok: true, import: prefill.importPage(await readJSONBody(req)) });
  }
  if (req.method === 'POST' && urlPath === '/api/prefill/resolve-conflicts') {
    const result = prefill.resolveConflicts(await readJSONBody(req));
    const next = state(); persistDerived(next);
    return sendJSON(res, 200, { ok: true, ...result, readiness: next.readiness });
  }
  if (req.method === 'GET' && urlPath === '/api/prefill/bundle') {
    requirePrefillExtension(req);
    const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    return sendJSON(res, 200, { ok: true, bundle: prefill.bundleFor(requestUrl.searchParams.get('url') || '', requestUrl.searchParams.get('employer') || '') });
  }
  return false;
}

function serveStatic(res, urlPath) {
  const servedPath = urlPath === '/' ? '/dashboard.html' : urlPath;
  let filePath;
  if (/^\/[a-z_]+\.csv$/i.test(servedPath)) filePath = path.join(DASHBOARD_DATA_ROOT, path.basename(servedPath));
  else filePath = path.resolve(DASHBOARD_ROOT, `.${servedPath}`);
  const allowed = filePath.startsWith(`${DASHBOARD_ROOT}${path.sep}`) || filePath.startsWith(`${DASHBOARD_DATA_ROOT}${path.sep}`) || filePath === path.join(DASHBOARD_ROOT, 'dashboard.html');
  if (!allowed) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(filePath, (error, content) => {
    if (error) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY' });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const urlPath = decodeURIComponent(requestUrl.pathname);
  try {
    const origin = String(req.headers.origin || '');
    const localOrigin = /^https?:\/\/(?:127\.0\.0\.1|localhost):8420$/i.test(origin);
    const extensionOrigin = /^chrome-extension:\/\/[a-z]+$/i.test(origin);
    if (origin && !localOrigin && !extensionOrigin) return sendError(res, 403, 'Origin not allowed');
    if (extensionOrigin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    }
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    if (req.method === 'GET' && urlPath === '/oauth/outlook/callback') {
      await outlook.completeConnect(requestUrl.searchParams);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY' });
      return res.end('<!doctype html><meta charset="utf-8"><title>Outlook 已连接</title><body style="font-family:system-ui;padding:40px"><h1>Outlook 已连接</h1><p>可以关闭此窗口并返回 job_for_PHD。</p><script>setTimeout(()=>window.close(),1200)</script></body>');
    }
    if (urlPath.startsWith('/api/')) {
      const handled = await routeApi(req, res, urlPath);
      if (handled === false && !res.headersSent) sendError(res, 404, 'API endpoint not found');
      return;
    }
    if (req.method !== 'GET') return sendError(res, 405, 'Method not allowed');
    serveStatic(res, urlPath);
  } catch (error) {
    if (!res.headersSent) sendError(res, error.status || 500, error.message, error.details);
  }
});

server.on('error', error => {
  if (error.code === 'EADDRINUSE') console.error(`Port ${PORT} is already in use. Close the other program or the existing job_for_PHD server.`);
  else console.error(error);
  process.exitCode = 1;
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`${APP_NAME} is running at http://localhost:${PORT}/dashboard.html`);
  console.log('All candidate data stays in the local user-data directory.');
  setTimeout(() => outlook.sync().catch(() => {}), 1500).unref();
});

setInterval(() => outlook.sync().catch(() => {}), 15 * 60 * 1000).unref();

module.exports = { server, parseCSV, stringifyCSV };
