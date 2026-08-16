const fs = require('fs');
const crypto = require('crypto');
const { PublicClientApplication } = require('@azure/msal-node');
const {
  DataProtectionScope, PersistenceCreator, PersistenceCachePlugin,
} = require('@azure/msal-node-extensions');
const {
  PORT, OUTLOOK_CONFIG_PATH, OUTLOOK_CACHE_PATH, MAIL_REVIEW_PATH,
  DASHBOARD_DATA_ROOT,
} = require('./config');
const { ensureDir, readJSON, writeJSON } = require('./storage');
const { readCSVRows, writeCSVRows } = require('./csv');
const { parseInterviewMessage, suggestAssociation } = require('./mail-parser');
const { locateJobById, updateJob, createFollowUp, updateFollowUp } = require('./job-service');

const SCOPES = ['openid', 'profile', 'offline_access', 'User.Read', 'Mail.Read', 'Calendars.ReadWrite'];
const pendingAuth = new Map();

function publicConfig(config = {}) {
  return {
    client_id: config.client_id || '', tenant: config.tenant || 'common',
    account_username: config.account_username || '', last_sync_at: config.last_sync_at || '',
    last_error: config.last_error || '', connected: Boolean(config.account_home_id && fs.existsSync(OUTLOOK_CACHE_PATH)),
  };
}

function configValue() {
  return readJSON(OUTLOOK_CONFIG_PATH, { schema_version: 1, client_id: '', tenant: 'common', delta_link: '' });
}

function writeConfig(patch) {
  const next = { ...configValue(), ...patch, schema_version: 1 };
  writeJSON(OUTLOOK_CONFIG_PATH, next);
  return next;
}

async function clientFor(config = configValue()) {
  if (!config.client_id) throw Object.assign(new Error('Outlook Client ID is not configured'), { status: 422 });
  ensureDir(require('path').dirname(OUTLOOK_CACHE_PATH));
  const persistence = await PersistenceCreator.createPersistence({
    cachePath: OUTLOOK_CACHE_PATH,
    dataProtectionScope: DataProtectionScope.CurrentUser,
    serviceName: 'job_for_PHD', accountName: 'outlook', usePlaintextFileOnLinux: false,
  });
  return new PublicClientApplication({
    auth: { clientId: config.client_id, authority: `https://login.microsoftonline.com/${config.tenant || 'common'}` },
    cache: { cachePlugin: new PersistenceCachePlugin(persistence) },
    system: { loggerOptions: { piiLoggingEnabled: false, loggerCallback: () => {} } },
  });
}

function pkce() {
  const verifier = crypto.randomBytes(48).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

async function beginConnect({ client_id, tenant = 'common' }) {
  const cleanClientId = String(client_id || '').trim();
  if (!/^[0-9a-f-]{30,40}$/i.test(cleanClientId)) throw Object.assign(new Error('A valid Microsoft Application Client ID is required'), { status: 422 });
  const cleanTenant = String(tenant || 'common').trim() || 'common';
  if (!/^(?:common|organizations|consumers|[0-9a-f-]{30,40}|[a-z0-9.-]+\.[a-z]{2,})$/i.test(cleanTenant)) throw Object.assign(new Error('Invalid Microsoft tenant'), { status: 422 });
  const config = writeConfig({ client_id: cleanClientId, tenant: cleanTenant, last_error: '' });
  const client = await clientFor(config);
  const state = crypto.randomBytes(24).toString('hex');
  const { verifier, challenge } = pkce();
  const redirectUri = `http://localhost:${PORT}/oauth/outlook/callback`;
  pendingAuth.set(state, { verifier, redirectUri, createdAt: Date.now() });
  for (const [key, value] of pendingAuth) if (Date.now() - value.createdAt > 10 * 60 * 1000) pendingAuth.delete(key);
  const authorization_url = await client.getAuthCodeUrl({
    scopes: SCOPES, redirectUri, state, codeChallenge: challenge, codeChallengeMethod: 'S256', prompt: 'select_account',
  });
  return { authorization_url };
}

async function completeConnect(query) {
  const state = String(query.get('state') || '');
  const pending = pendingAuth.get(state);
  pendingAuth.delete(state);
  if (!pending || Date.now() - pending.createdAt > 10 * 60 * 1000 || query.get('error')) throw new Error(query.get('error_description') || 'Outlook authorization expired or was rejected');
  const client = await clientFor();
  const result = await client.acquireTokenByCode({
    code: query.get('code'), codeVerifier: pending.verifier, redirectUri: pending.redirectUri, scopes: SCOPES,
  });
  writeConfig({
    account_home_id: result.account?.homeAccountId || '',
    account_username: result.account?.username || '', last_error: '', delta_link: '',
  });
  return publicConfig(configValue());
}

async function accountAndToken() {
  const config = configValue();
  const client = await clientFor(config);
  const accounts = await client.getTokenCache().getAllAccounts();
  const account = accounts.find(item => item.homeAccountId === config.account_home_id) || accounts[0];
  if (!account) throw Object.assign(new Error('Outlook connection requires sign-in'), { status: 401 });
  const token = await client.acquireTokenSilent({ account, scopes: SCOPES });
  return { client, account, accessToken: token.accessToken };
}

async function disconnect() {
  try {
    const { client } = await accountAndToken();
    for (const account of await client.getTokenCache().getAllAccounts()) await client.getTokenCache().removeAccount(account);
  } catch {}
  if (fs.existsSync(OUTLOOK_CACHE_PATH)) fs.rmSync(OUTLOOK_CACHE_PATH, { force: true });
  const current = configValue();
  writeJSON(OUTLOOK_CONFIG_PATH, {
    schema_version: 1, client_id: current.client_id || '', tenant: current.tenant || 'common',
    delta_link: '', account_home_id: '', account_username: '', last_sync_at: '', last_error: '',
  });
  return publicConfig(configValue());
}

async function graph(url, options = {}) {
  const { accessToken } = await accountAndToken();
  const response = await fetch(url.startsWith('http') ? url : `https://graph.microsoft.com/v1.0${url}`, {
    ...options,
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const error = new Error(body.error?.message || `Microsoft Graph request failed (${response.status})`);
    error.status = response.status === 401 ? 401 : 502;
    error.retry_after = response.headers.get('retry-after') || '';
    throw error;
  }
  if (response.status === 204) return null;
  return response.json();
}

function objectsFromCsv(name) {
  const { header, dataRows } = readCSVRows(require('path').join(DASHBOARD_DATA_ROOT, name));
  return dataRows.map(row => Object.fromEntries(header.map((key, index) => [key, row[index] || ''])));
}

function queueValue() { return readJSON(MAIL_REVIEW_PATH, []); }

async function fullMessage(message) {
  const id = encodeURIComponent(message.id);
  const detail = await graph(`/me/messages/${id}?$select=id,internetMessageId,subject,from,receivedDateTime,body,bodyPreview,hasAttachments,webLink`);
  const attachments = [];
  if (detail.hasAttachments) {
    const result = await graph(`/me/messages/${id}/attachments?$select=name,contentType,contentBytes`);
    for (const item of result.value || []) {
      if (/text\/calendar/i.test(item.contentType || '') || /\.ics$/i.test(item.name || '')) {
        attachments.push({ name: item.name, contentType: item.contentType, content: item.contentBytes ? Buffer.from(item.contentBytes, 'base64').toString('utf8') : '' });
      }
    }
  }
  return { ...detail, body: detail.body?.content || detail.bodyPreview || '', attachments };
}

function initialDeltaUrl() {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const select = 'id,internetMessageId,subject,from,receivedDateTime,bodyPreview,hasAttachments,webLink';
  return `/me/mailFolders/inbox/messages/delta?$select=${select}&$filter=receivedDateTime ge ${since}`;
}

async function sync() {
  const config = configValue();
  if (!config.client_id || !config.account_home_id) return { skipped: true, reason: 'not_connected', added: 0 };
  try {
    let url = config.delta_link || initialDeltaUrl();
    let messages = [];
    let deltaLink = config.delta_link || '';
    for (let page = 0; url && page < 10; page += 1) {
      const result = await graph(url);
      messages = messages.concat((result.value || []).filter(item => !item['@removed']));
      url = result['@odata.nextLink'] || '';
      deltaLink = result['@odata.deltaLink'] || deltaLink;
    }
    const queue = queueValue();
    const known = new Set(queue.map(item => item.source_hash));
    const jobs = objectsFromCsv('job_pool.csv');
    const postdocs = objectsFromCsv('postdoc_pipeline.csv');
    let added = 0;
    for (const message of messages) {
      const previewText = `${message.subject || ''}\n${message.bodyPreview || ''}`;
      if (!/面试|笔试|测评|interview|assessment|screening|teams|zoom|webex|meeting/i.test(previewText) && !message.hasAttachments) continue;
      const parsed = parseInterviewMessage(await fullMessage(message));
      if (!parsed || known.has(parsed.source_hash)) continue;
      suggestAssociation(parsed, jobs, postdocs);
      queue.push(parsed); known.add(parsed.source_hash); added += 1;
    }
    writeJSON(MAIL_REVIEW_PATH, queue);
    writeConfig({ delta_link: deltaLink, last_sync_at: new Date().toISOString(), last_error: '' });
    return { skipped: false, added, pending: queue.filter(item => item.status === 'pending').length, last_sync_at: configValue().last_sync_at };
  } catch (error) {
    writeConfig({ last_error: error.message, last_sync_at: new Date().toISOString() });
    throw error;
  }
}

function addMinutes(time, minutes) {
  const [hour, minute] = String(time).split(':').map(Number);
  const total = (hour * 60 + minute + minutes) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function graphTimezone(value) {
  const map = {
    'Asia/Shanghai': 'China Standard Time', 'Europe/Berlin': 'W. Europe Standard Time',
    'Europe/London': 'GMT Standard Time', UTC: 'UTC', 'America/New_York': 'Eastern Standard Time',
    'America/Los_Angeles': 'Pacific Standard Time',
  };
  return map[value] || value || 'China Standard Time';
}

function graphEndDate(date, startTime, endTime) {
  if (String(endTime) > String(startTime)) return date;
  const next = new Date(`${date}T12:00:00Z`); next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

async function createOutlookEvent(followUp) {
  const timeZone = graphTimezone(followUp.timezone);
  const payload = {
    subject: `${followUp.event_type || '面试'} · ${followUp.company || followUp.contact || 'job_for_PHD'}`,
    body: { contentType: 'text', content: `由 job_for_PHD 从已确认的面试邮件创建。\n${followUp.company || ''} ${followUp.job_title || ''}`.trim() },
    start: { dateTime: `${followUp.date}T${followUp.time}:00`, timeZone },
    end: { dateTime: `${graphEndDate(followUp.date, followUp.time, followUp.end_time || addMinutes(followUp.time, 60))}T${followUp.end_time || addMinutes(followUp.time, 60)}:00`, timeZone },
    location: { displayName: followUp.location || followUp.meeting_url || '' },
    transactionId: followUp.id,
  };
  return graph('/me/events', { method: 'POST', body: JSON.stringify(payload) });
}

function validateConfirmation(body) {
  if (!['job', 'postdoc'].includes(body.association_type) || !String(body.record_id || '').trim()) throw Object.assign(new Error('Select a company job or postdoc record'), { status: 422 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date || '') || !/^\d{2}:\d{2}$/.test(body.time || '')) throw Object.assign(new Error('Confirmed date and time are required'), { status: 422 });
  if (!String(body.timezone || '').trim()) throw Object.assign(new Error('Timezone is required'), { status: 422 });
}

async function confirmReview(id, body) {
  validateConfirmation(body);
  const queue = queueValue();
  const item = queue.find(record => record.id === id && record.status === 'pending');
  if (!item) throw Object.assign(new Error('Mail review item not found or already handled'), { status: 404 });
  const existingFollowUps = objectsFromCsv('follow_up.csv');
  const duplicate = existingFollowUps.find(event => event.source_id === item.source_hash);
  if (duplicate) {
    item.status = 'confirmed'; item.confirmed_at = item.confirmed_at || new Date().toISOString(); item.follow_up_id = duplicate.id;
    writeJSON(MAIL_REVIEW_PATH, queue);
    return { event: duplicate, outlook_synced: duplicate.outlook_sync_status === 'synced', duplicate: true };
  }
  let association;
  if (body.association_type === 'job') {
    association = locateJobById(body.record_id).record;
    if (association.status !== 'Submitted') throw Object.assign(new Error('Interview mail can only link to a job with real Submitted evidence'), { status: 409 });
    updateJob(body.record_id, { current_stage: body.event_type || item.event_type || '面试' });
  } else {
    const postdocPath = require('path').join(DASHBOARD_DATA_ROOT, 'postdoc_pipeline.csv');
    const { header, dataRows } = readCSVRows(postdocPath);
    const row = dataRows.find(value => value[header.indexOf('id')] === body.record_id);
    if (!row) throw Object.assign(new Error('Postdoc record not found'), { status: 404 });
    row[header.indexOf('status')] = 'Interview';
    if (header.includes('interview_date')) row[header.indexOf('interview_date')] = body.date;
    writeCSVRows(postdocPath, header, dataRows);
    association = Object.fromEntries(header.map((key, index) => [key, row[index] || '']));
  }
  const event = createFollowUp({
    date: body.date, time: body.time, end_time: body.end_time || addMinutes(body.time, 60),
    timezone: body.timezone, company: body.association_type === 'job' ? association.company : association.institute,
    job_title: body.association_type === 'job' ? association.job_title : (association.position_title || association.pi_group),
    contact: body.contact || item.contact, channel: 'Outlook', event_type: body.event_type || item.event_type || '面试',
    location: body.location || '', meeting_url: body.meeting_url || '', pipeline_type: body.association_type,
    record_id: body.record_id, source_type: 'outlook_mail', source_id: item.source_hash,
    outlook_sync_status: 'pending', notes: `来源邮件：${item.subject}`.slice(0, 500),
  });
  item.status = 'confirmed'; item.confirmed_at = new Date().toISOString(); item.follow_up_id = event.id;
  writeJSON(MAIL_REVIEW_PATH, queue);
  try {
    const outlookEvent = await createOutlookEvent(event);
    return { event: updateFollowUp(event.id, { outlook_event_id: outlookEvent.id, outlook_sync_status: 'synced' }), outlook_synced: true };
  } catch (error) {
    return { event: updateFollowUp(event.id, { outlook_sync_status: 'failed' }), outlook_synced: false, outlook_error: error.message };
  }
}

function dismissReview(id) {
  const queue = queueValue();
  const item = queue.find(record => record.id === id && record.status === 'pending');
  if (!item) throw Object.assign(new Error('Mail review item not found or already handled'), { status: 404 });
  item.status = 'dismissed'; item.dismissed_at = new Date().toISOString();
  writeJSON(MAIL_REVIEW_PATH, queue);
  return item;
}

async function retryFollowUp(id) {
  const filePath = require('path').join(DASHBOARD_DATA_ROOT, 'follow_up.csv');
  const { header, dataRows } = readCSVRows(filePath);
  const row = dataRows.find(value => value[header.indexOf('id')] === id);
  if (!row) throw Object.assign(new Error('Follow-up record not found'), { status: 404 });
  const event = Object.fromEntries(header.map((key, index) => [key, row[index] || '']));
  if (event.outlook_sync_status === 'synced') return event;
  if (!['failed', 'pending'].includes(event.outlook_sync_status)) throw Object.assign(new Error('This event is not waiting for Outlook sync'), { status: 409 });
  const result = await createOutlookEvent(event);
  return updateFollowUp(id, { outlook_event_id: result.id, outlook_sync_status: 'synced' });
}

function status() { return { ...publicConfig(configValue()), pending_count: queueValue().filter(item => item.status === 'pending').length }; }
function reviews() { return queueValue().filter(item => item.status === 'pending'); }

module.exports = {
  SCOPES, status, reviews, beginConnect, completeConnect, disconnect, sync,
  confirmReview, dismissReview, retryFollowUp, createOutlookEvent,
  addMinutes, graphTimezone, graphEndDate, validateConfirmation,
};
