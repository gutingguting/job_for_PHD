const path = require('path');
const crypto = require('crypto');
const { DASHBOARD_DATA_ROOT } = require('./config');
const { readCSVRows, writeCSVRows } = require('./csv');

const JOB_POOL_PATH = path.join(DASHBOARD_DATA_ROOT, 'job_pool.csv');
const APPLICATION_LOG_PATH = path.join(DASHBOARD_DATA_ROOT, 'application_log.csv');
const STATUS_HISTORY_PATH = path.join(DASHBOARD_DATA_ROOT, 'status_history.csv');
const JOB_STATUSES = ['Pending', 'Needs user', 'Submitted', 'Offer', 'Rejected', 'Skipped', 'Blocked'];

function rowObject(header, row) {
  return Object.fromEntries(header.map((key, index) => [key, row[index] || '']));
}

function setCell(header, row, key, value) {
  const index = header.indexOf(key);
  if (index >= 0) row[index] = String(value ?? '').trim();
}

function locateJobById(id) {
  const { header, dataRows } = readCSVRows(JOB_POOL_PATH);
  const idCol = header.indexOf('id');
  const row = dataRows.find(item => item[idCol] === id);
  if (!row) throw Object.assign(new Error('Job record not found; refresh and try again'), { status: 404 });
  return { header, dataRows, row, record: rowObject(header, row) };
}

function appendRow(filePath, values) {
  const { header, dataRows } = readCSVRows(filePath);
  dataRows.push(header.map(key => String(values[key] ?? '').trim()));
  writeCSVRows(filePath, header, dataRows);
}

function statusReason(status, body) {
  if (status === 'Skipped') return String(body.skip_reason || body.reason || '').trim();
  if (status === 'Blocked') return String(body.blocker || body.reason || '').trim();
  if (status === 'Needs user') return String(body.status_reason || body.reason || '').trim();
  return String(body.status_reason || body.reason || '').trim();
}

function validateJobUpdate(existing, body) {
  if ('status' in body && !JOB_STATUSES.includes(body.status)) {
    throw Object.assign(new Error('Invalid job status'), { status: 422 });
  }
  const nextStatus = body.status || existing.status || 'Pending';
  if (['Skipped', 'Blocked', 'Needs user'].includes(nextStatus) && !statusReason(nextStatus, body)) {
    throw Object.assign(new Error(`${nextStatus} requires a reason`), { status: 422 });
  }
  if (body.status === 'Submitted' && existing.status !== 'Submitted') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(body.submission_date || ''))) {
      throw Object.assign(new Error('Submitted requires the actual submission date'), { status: 422 });
    }
    if (!String(body.submission_evidence || '').trim()) {
      throw Object.assign(new Error('Submitted requires confirmation evidence'), { status: 422 });
    }
  }
}

function updateJob(id, body) {
  const job = locateJobById(id);
  const before = job.record;
  validateJobUpdate(before, body);
  const nextStatus = body.status || before.status || 'Pending';
  const nextStage = 'current_stage' in body ? String(body.current_stage || '').trim() : before.current_stage;
  const reason = statusReason(nextStatus, body);

  if ('status' in body) setCell(job.header, job.row, 'status', nextStatus);
  if ('current_stage' in body) setCell(job.header, job.row, 'current_stage', nextStage);
  if (nextStatus === 'Skipped') setCell(job.header, job.row, 'skip_reason', reason);
  if (nextStatus === 'Blocked') setCell(job.header, job.row, 'blocker', reason);
  if (nextStatus === 'Needs user') setCell(job.header, job.row, 'status_reason', reason);
  if ('status' in body || 'current_stage' in body) setCell(job.header, job.row, 'last_status_updated', new Date().toISOString());
  writeCSVRows(JOB_POOL_PATH, job.header, job.dataRows);

  if (before.status !== nextStatus || before.current_stage !== nextStage) {
    appendRow(STATUS_HISTORY_PATH, {
      timestamp: new Date().toISOString(), job_id: id, company: before.company,
      job_title: before.job_title, from_status: before.status, to_status: nextStatus,
      from_stage: before.current_stage, to_stage: nextStage, reason,
    });
  }

  if (body.status === 'Submitted' && before.status !== 'Submitted') {
    appendRow(APPLICATION_LOG_PATH, {
      attempt_date: body.submission_date, company: before.company, job_title: before.job_title,
      job_url: before.job_url, platform: body.platform || 'manual update', status: 'Submitted',
      submission_evidence: body.submission_evidence, resume_used: body.resume_used || before.resume_variant,
      answers_used: body.answers_used || '', confirmation_url: body.confirmation_url || '',
      confirmation_text: body.confirmation_text || body.submission_evidence,
      notes: body.notes || 'Recorded through Dashboard status control.',
    });
  }
  return rowObject(job.header, job.row);
}

function createFollowUp(values) {
  const filePath = path.join(DASHBOARD_DATA_ROOT, 'follow_up.csv');
  const { header, dataRows } = readCSVRows(filePath);
  const record = { id: crypto.randomUUID(), status: 'Scheduled', ...values };
  const row = header.map(key => String(record[key] ?? '').trim());
  dataRows.push(row);
  writeCSVRows(filePath, header, dataRows);
  return rowObject(header, row);
}

function updateFollowUp(id, patch) {
  const filePath = path.join(DASHBOARD_DATA_ROOT, 'follow_up.csv');
  const { header, dataRows } = readCSVRows(filePath);
  const idCol = header.indexOf('id');
  const row = dataRows.find(item => item[idCol] === id);
  if (!row) throw Object.assign(new Error('Follow-up record not found'), { status: 404 });
  for (const [key, value] of Object.entries(patch)) setCell(header, row, key, value);
  writeCSVRows(filePath, header, dataRows);
  return rowObject(header, row);
}

module.exports = {
  JOB_STATUSES, JOB_POOL_PATH, locateJobById, updateJob, createFollowUp, updateFollowUp,
  validateJobUpdate, statusReason,
};
