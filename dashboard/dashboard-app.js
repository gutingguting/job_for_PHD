import { api, readCSV } from './api.js';
import { ProfileCenter } from './profile-center.js';
import { PostdocPipeline } from './postdoc.js';
import { PrefillCenter } from './prefill-center.js';

const escapeHTML = value => String(value ?? '').replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]);
const state = { jobs: [], followups: [], readiness: null, activeView: 'dashboard', outlook: null, mailReviews: [] };
const FRONTEND_VERSION = '1.3.0';
const JOB_STATUSES = ['Pending', 'Needs user', 'Submitted', 'Offer', 'Rejected', 'Skipped', 'Blocked'];
let toastTimer;

function toast(message, error = false) {
  const element = document.getElementById('toast');
  element.textContent = message; element.style.background = error ? 'var(--bad)' : 'var(--text)'; element.classList.remove('hidden');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => element.classList.add('hidden'), 3200);
}

function navigate(view) {
  state.activeView = view;
  document.querySelectorAll('.app-view').forEach(section => section.classList.toggle('hidden', section.id !== `${view}-view`));
  document.querySelectorAll('.nav-link').forEach(button => button.classList.toggle('active', button.dataset.viewLink === view));
  history.replaceState(null, '', `#${view}`);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateReadiness(readiness) {
  state.readiness = readiness;
  const dot = document.getElementById('nav-readiness-dot'); dot.classList.toggle('ready', readiness.lead_finding_ready);
  const title = document.getElementById('readiness-title'); const summary = document.getElementById('readiness-summary');
  if (!readiness.lead_finding_ready) {
    title.textContent = '最低资料尚未完成';
    summary.textContent = `还缺少 ${readiness.missing.lead_finding.length} 项找岗位所需资料。可保存草稿，岗位看板保持只读。`;
  } else if (!readiness.application_authorized) {
    title.textContent = '找岗位已就绪｜投递尚未授权';
    summary.textContent = readiness.application_facts_ready ? '投递所需事实已完整，但最终提交仍必须逐次取得明确批准。' : `简历和筛选规则已就绪；投递前仍有 ${readiness.missing.application.length} 项需要完善。`;
  } else {
    title.textContent = '找岗位已就绪｜逐次确认申请'; summary.textContent = '任何最终提交步骤仍会停止并请求你的明确批准。';
  }
}

function jobBucket(job) {
  if (['Offer', 'Rejected', 'Skipped'].includes(job.status) || /closed|expired/i.test(job.opening_status || '')) return 'ended';
  if (job.status === 'Submitted') return 'Submitted';
  return 'pending';
}

function renderJobs() {
  const search = document.getElementById('job-search').value.trim().toLowerCase();
  const filter = document.getElementById('job-status-filter').value;
  const visible = state.jobs.filter(job => (!filter || job.status === filter || jobBucket(job) === filter) && (!search || [job.company, job.job_title, job.category, job.location].join(' ').toLowerCase().includes(search)));
  document.getElementById('metric-applied').textContent = state.jobs.filter(job => jobBucket(job) === 'Submitted').length;
  document.getElementById('metric-pending').textContent = state.jobs.filter(job => jobBucket(job) === 'pending').length;
  document.getElementById('metric-ended').textContent = state.jobs.filter(job => jobBucket(job) === 'ended').length;
  document.getElementById('job-list').innerHTML = visible.length ? visible.map(job => `<article class="record-card"><div class="record-top"><div><div class="record-title">${escapeHTML(job.job_title || '未命名岗位')}</div><div class="record-sub">${escapeHTML(job.company)}${job.location ? ` · ${escapeHTML(job.location)}` : ''}</div></div><div class="job-controls"><label>主状态<select data-job-status="${escapeHTML(job.id)}" aria-label="${escapeHTML(job.company)} ${escapeHTML(job.job_title)} 主状态">${JOB_STATUSES.map(value => `<option${value === (job.status || 'Pending') ? ' selected' : ''}>${value}</option>`).join('')}</select></label><label>当前阶段<input data-job-stage="${escapeHTML(job.id)}" list="job-stage-suggestions" value="${escapeHTML(job.current_stage || '')}" placeholder="已投递 / 一面…" ${job.status !== 'Submitted' ? 'disabled' : ''}></label></div></div><div class="chips"><span class="chip ${job.status === 'Submitted' ? 'good' : job.status === 'Needs user' ? 'warn' : ''}">${escapeHTML(job.status || 'Pending')}</span>${[job.category, job.priority, job.fit_label, job.opening_status].filter(Boolean).map(value => `<span class="chip">${escapeHTML(value)}</span>`).join('')}</div><div class="record-details"><div><strong>筛选理由</strong>${escapeHTML(job.status_reason || job.skip_reason || job.blocker || job.notes || '暂无')}</div><div><strong>下一步</strong>${escapeHTML(job.next_action || '待设置')}</div><div><strong>来源</strong>${job.job_url ? `<a href="${escapeHTML(job.job_url)}" target="_blank" rel="noopener noreferrer">查看公开职位页</a>` : escapeHTML(job.source || '未记录')}</div></div></article>`).join('') : '<div class="empty-state">没有符合当前筛选条件的岗位。</div>';
  document.querySelectorAll('[data-job-status]').forEach(select => select.addEventListener('change', () => openJobStatus(select.dataset.jobStatus, select.value)));
  document.querySelectorAll('[data-job-stage]').forEach(input => input.addEventListener('change', async () => {
    try { await api.updateJob(input.dataset.jobStage, { current_stage: input.value.trim() }); await loadOperationalData(); toast('岗位阶段已更新'); }
    catch (error) { toast(error.message, true); renderJobs(); }
  }));
}

function openJobStatus(id, status) {
  const job = state.jobs.find(item => item.id === id);
  if (!job || status === job.status) return;
  document.getElementById('job-status-id').value = id;
  document.getElementById('job-status-value').value = status;
  document.getElementById('job-status-title').textContent = `${job.company} · ${job.job_title}`;
  document.getElementById('job-status-reason').value = '';
  document.getElementById('job-submission-date').value = localDate(new Date());
  document.getElementById('job-submission-evidence').value = '';
  updateStatusDialogFields();
  document.getElementById('job-status-dialog').showModal();
}

function updateStatusDialogFields() {
  const status = document.getElementById('job-status-value').value;
  document.getElementById('job-submission-fields').classList.toggle('hidden', status !== 'Submitted');
  document.getElementById('job-status-reason-fields').classList.toggle('hidden', !['Needs user', 'Skipped', 'Blocked'].includes(status));
}

function closeJobStatus() { document.getElementById('job-status-dialog').close(); renderJobs(); }

async function saveJobStatus(event) {
  event.preventDefault();
  const id = document.getElementById('job-status-id').value;
  const status = document.getElementById('job-status-value').value;
  const value = { status, reason: document.getElementById('job-status-reason').value.trim() };
  if (status === 'Submitted') {
    value.submission_date = document.getElementById('job-submission-date').value;
    value.platform = document.getElementById('job-submission-platform').value.trim();
    value.submission_evidence = document.getElementById('job-submission-evidence').value.trim();
    value.current_stage = '已投递';
  }
  try { await api.updateJob(id, value); document.getElementById('job-status-dialog').close(); await loadOperationalData(); toast('岗位真实状态已保存'); }
  catch (error) { toast(error.message, true); }
}

function localDate(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }

function renderCalendar() {
  const container = document.getElementById('calendar-week'); const today = new Date(); today.setHours(0,0,0,0);
  container.innerHTML = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today); date.setDate(today.getDate() + index); const key = localDate(date);
    const events = state.followups.filter(item => item.date === key && item.status !== 'Done');
    return `<article class="calendar-day ${index === 0 ? 'today' : ''}"><div class="calendar-date">${index === 0 ? '今天 · ' : ''}${date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', weekday: 'short' })}</div>${events.length ? events.map(event => `<div class="calendar-event" data-calendar-row="${event.__rowIndex}"><strong>${escapeHTML(event.time)}</strong> ${escapeHTML(event.event_type)}<br>${escapeHTML(event.company)}${event.outlook_sync_status === 'failed' ? `<br><button type="button" class="calendar-retry" data-retry-outlook="${escapeHTML(event.id)}">重试 Outlook</button>` : ''}</div>`).join('') : '<span class="calendar-empty">暂无安排</span>'}</article>`;
  }).join('');
  document.querySelectorAll('[data-calendar-row]').forEach(element => element.addEventListener('click', () => openCalendar(state.followups.find(item => item.__rowIndex === Number(element.dataset.calendarRow)))));
  document.querySelectorAll('[data-retry-outlook]').forEach(button => button.addEventListener('click', async event => {
    event.stopPropagation(); button.disabled = true;
    try { await api.retryOutlook(button.dataset.retryOutlook); await loadOperationalData(); toast('Outlook 日历同步成功'); }
    catch (error) { button.disabled = false; toast(error.message, true); }
  }));
  const select = document.getElementById('cal-job');
  select.innerHTML = '<option value="">选择已投递岗位</option>' + state.jobs.filter(job => job.status === 'Submitted').map(job => `<option value="${job.__rowIndex}">${escapeHTML(job.company)} · ${escapeHTML(job.job_title)}</option>`).join('');
}

function openCalendar(event = null) {
  const form = document.getElementById('calendar-form'); form.classList.remove('hidden'); form.reset();
  document.getElementById('cal-row-index').value = event?.__rowIndex ?? '';
  document.getElementById('cal-date').value = event?.date || localDate(new Date()); document.getElementById('cal-time').value = event?.time || '09:00'; document.getElementById('cal-event-type').value = event?.event_type || '';
  if (event) { const job = state.jobs.find(item => item.company === event.company && item.job_title === event.job_title && item.status === 'Submitted'); document.getElementById('cal-job').value = job?.__rowIndex ?? ''; }
}

async function saveCalendar(event) {
  event.preventDefault();
  const job = state.jobs.find(item => item.__rowIndex === Number(document.getElementById('cal-job').value));
  if (!job) return toast('请选择一个已投递岗位', true);
  const row = document.getElementById('cal-row-index').value;
  const value = { jobRowIndex: job.__rowIndex, company: job.company, job_title: job.job_title, date: document.getElementById('cal-date').value, time: document.getElementById('cal-time').value, event_type: document.getElementById('cal-event-type').value };
  if (row !== '') value.followUpRowIndex = Number(row);
  try { await api.calendar(row === '' ? 'add' : 'update', value); document.getElementById('calendar-form').classList.add('hidden'); await loadOperationalData(); toast('日程已保存'); }
  catch (error) { toast(error.message, true); }
}

function associationOptions(selectedType, selectedId) {
  const options = ['<option value="">请选择关联记录</option>'];
  for (const job of state.jobs.filter(item => item.status === 'Submitted')) {
    const value = `job:${job.id}`; options.push(`<option value="${escapeHTML(value)}"${selectedType === 'job' && selectedId === job.id ? ' selected' : ''}>企业 · ${escapeHTML(job.company)} · ${escapeHTML(job.job_title)}</option>`);
  }
  for (const item of postdoc.items.filter(value => value.status !== 'Closed')) {
    const value = `postdoc:${item.id}`; options.push(`<option value="${escapeHTML(value)}"${selectedType === 'postdoc' && selectedId === item.id ? ' selected' : ''}>博士后 · ${escapeHTML(item.institute)} · ${escapeHTML(item.position_title || item.pi_group || '未命名')}</option>`);
  }
  return options.join('');
}

function renderMailReviews() {
  const list = document.getElementById('mail-review-list');
  if (!state.mailReviews.length) { list.innerHTML = '<div class="empty-state compact">没有等待确认的面试邮件。</div>'; return; }
  list.innerHTML = state.mailReviews.map(item => `<article class="record-card mail-review-card"><div class="record-top"><div><div class="record-title">${escapeHTML(item.subject || '未命名邮件')}</div><div class="record-sub">${escapeHTML(item.sender_name || item.sender)} · ${escapeHTML(item.received_at ? new Date(item.received_at).toLocaleString('zh-CN') : '')}</div></div><span class="chip warn">等待确认</span></div><p class="mail-meta">${escapeHTML(item.summary || '')}</p><form class="mail-review-form" data-mail-review="${item.id}"><label class="span-all">关联申请<select name="association" required>${associationOptions(item.association_type, item.record_id)}</select></label><label>日期<input name="date" type="date" value="${escapeHTML(item.date)}" required></label><label>开始时间<input name="time" type="time" value="${escapeHTML(item.time)}" required></label><label>结束时间<input name="end_time" type="time" value="${escapeHTML(item.end_time)}"></label><label>时区<input name="timezone" value="${escapeHTML(item.timezone || 'Asia/Shanghai')}" required></label><label>阶段<input name="event_type" list="job-stage-suggestions" value="${escapeHTML(item.event_type || '面试')}"></label><label>地点<input name="location" value="${escapeHTML(item.location || '')}"></label><label class="span-two">会议链接<input name="meeting_url" type="url" value="${escapeHTML(item.meeting_url || '')}"></label><div class="form-actions span-all"><button type="button" class="button ghost" data-mail-dismiss="${item.id}">忽略</button><button class="button primary">确认并加入两个日历</button></div></form></article>`).join('');
  document.querySelectorAll('[data-mail-review]').forEach(form => form.addEventListener('submit', confirmMailReview));
  document.querySelectorAll('[data-mail-dismiss]').forEach(button => button.addEventListener('click', () => dismissMailReview(button.dataset.mailDismiss)));
}

async function loadOutlook() {
  const [statusResponse, reviewResponse] = await Promise.all([api.outlookStatus(), api.mailReviews()]);
  state.outlook = statusResponse.outlook; state.mailReviews = reviewResponse.reviews;
  const outlook = state.outlook;
  document.getElementById('outlook-client-id').value = outlook.client_id || '';
  document.getElementById('outlook-tenant').value = outlook.tenant || 'common';
  document.getElementById('outlook-connect-form').classList.toggle('hidden', outlook.connected);
  document.getElementById('outlook-disconnect-btn').classList.toggle('hidden', !outlook.connected);
  document.getElementById('outlook-sync-btn').disabled = !outlook.connected;
  const summary = document.getElementById('outlook-summary');
  summary.classList.toggle('sync-error', Boolean(outlook.last_error));
  summary.textContent = outlook.connected
    ? `${outlook.account_username || 'Outlook 已连接'} · 待确认 ${outlook.pending_count} 封${outlook.last_sync_at ? ` · 上次同步 ${new Date(outlook.last_sync_at).toLocaleString('zh-CN')}` : ''}${outlook.last_error ? ` · ${outlook.last_error}` : ''}`
    : 'Outlook 尚未连接；其他功能不受影响。';
  renderMailReviews();
}

async function connectOutlook(event) {
  event.preventDefault();
  const submit = event.currentTarget.querySelector('button'); submit.disabled = true;
  const authWindow = window.open('', 'job_for_PHD_outlook_auth', 'width=760,height=720');
  if (!authWindow) { submit.disabled = false; toast('浏览器阻止了 Microsoft 登录窗口，请允许本站弹出窗口后重试', true); return; }
  try {
    const response = await api.outlookConnect({ client_id: document.getElementById('outlook-client-id').value, tenant: document.getElementById('outlook-tenant').value });
    authWindow.location.href = response.authorization_url;
    toast('请在 Microsoft 窗口完成授权');
    let attempts = 0;
    const poll = setInterval(async () => {
      attempts += 1;
      try { await loadOutlook(); if (state.outlook.connected) { clearInterval(poll); submit.disabled = false; toast('Outlook 已连接'); await syncOutlook(); } }
      catch {}
      if (attempts >= 30) { clearInterval(poll); submit.disabled = false; }
    }, 2000);
  } catch (error) { authWindow?.close(); submit.disabled = false; toast(error.message, true); }
}

async function syncOutlook() {
  const button = document.getElementById('outlook-sync-btn'); button.disabled = true; button.textContent = '正在检查…';
  try { const response = await api.outlookSync(); await loadOutlook(); toast(`Outlook 检查完成，新增 ${response.result.added || 0} 封待确认邮件`); }
  catch (error) { toast(error.message, true); await loadOutlook().catch(() => {}); }
  finally { button.disabled = !state.outlook?.connected; button.textContent = '检查 Outlook 邮件'; }
}

async function confirmMailReview(event) {
  event.preventDefault();
  const form = event.currentTarget; const [association_type, record_id] = form.elements.association.value.split(':');
  const value = { association_type, record_id, date: form.elements.date.value, time: form.elements.time.value, end_time: form.elements.end_time.value, timezone: form.elements.timezone.value.trim(), event_type: form.elements.event_type.value.trim(), location: form.elements.location.value.trim(), meeting_url: form.elements.meeting_url.value.trim() };
  const button = form.querySelector('button[type="submit"]'); button.disabled = true;
  try { const response = await api.confirmMailReview(form.dataset.mailReview, value); await Promise.all([loadOperationalData(), postdoc.load(), loadOutlook()]); toast(response.outlook_synced ? '面试已加入本地与 Outlook 日历' : `本地日程已保存；Outlook 等待重试：${response.outlook_error}`); }
  catch (error) { button.disabled = false; toast(error.message, true); }
}

async function dismissMailReview(id) {
  if (!confirm('忽略这封邮件？它不会创建日程或改变申请状态。')) return;
  try { await api.dismissMailReview(id); await loadOutlook(); toast('邮件已忽略'); }
  catch (error) { toast(error.message, true); }
}

async function loadOperationalData() {
  [state.jobs, state.followups] = await Promise.all([readCSV('job_pool.csv'), readCSV('follow_up.csv')]);
  renderJobs(); renderCalendar(); document.getElementById('last-updated').textContent = `更新于 ${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
}

const postdoc = new PostdocPipeline({ toast, onCount: count => { document.getElementById('metric-postdoc').textContent = count; } });
const profile = new ProfileCenter({ toast, onReadiness: updateReadiness, navigate });
const prefill = new PrefillCenter({ toast });

async function initialize() {
  try {
    const health = await api.health();
    if (health.version !== FRONTEND_VERSION) {
      throw new Error(`服务版本不一致：网页为 v${FRONTEND_VERSION}，后台为 v${health.version || '未知'}。请关闭旧服务窗口并重新启动。`);
    }
    const [, readiness] = await Promise.all([loadOperationalData(), profile.load(), postdoc.load(), prefill.load()]);
    await loadOutlook();
    updateReadiness(readiness);
    document.getElementById('loading-view').classList.add('hidden');
    const requested = location.hash.slice(1);
    navigate(!readiness.lead_finding_ready ? 'profile' : ['dashboard', 'prefill', 'postdoc', 'profile'].includes(requested) ? requested : 'dashboard');
  } catch (error) {
    document.querySelector('#loading-view h1').textContent = '本地服务未能完成初始化'; document.querySelector('#loading-view p').textContent = error.message; toast(error.message, true);
  }
}

document.querySelectorAll('[data-view-link]').forEach(button => button.addEventListener('click', () => navigate(button.dataset.viewLink)));
document.getElementById('theme-toggle').addEventListener('click', () => { const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = next; localStorage.setItem('job-for-phd-theme', next); });
document.documentElement.dataset.theme = localStorage.getItem('job-for-phd-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
document.getElementById('refresh-btn').addEventListener('click', initialize);
document.getElementById('readiness-details').addEventListener('click', () => navigate('profile'));
document.querySelectorAll('[data-job-filter]').forEach(button => button.addEventListener('click', () => { document.getElementById('job-status-filter').value = button.dataset.jobFilter; renderJobs(); document.querySelector('.jobs-surface').scrollIntoView({ behavior: 'smooth' }); }));
document.getElementById('job-status-filter').addEventListener('change', renderJobs); document.getElementById('job-search').addEventListener('input', renderJobs);
document.getElementById('calendar-add-btn').addEventListener('click', () => openCalendar()); document.getElementById('cal-cancel-btn').addEventListener('click', () => document.getElementById('calendar-form').classList.add('hidden')); document.getElementById('calendar-form').addEventListener('submit', saveCalendar);
document.getElementById('job-status-value').addEventListener('change', updateStatusDialogFields);
document.getElementById('job-status-form').addEventListener('submit', saveJobStatus);
document.getElementById('job-status-close').addEventListener('click', closeJobStatus);
document.getElementById('job-status-cancel').addEventListener('click', closeJobStatus);
document.getElementById('outlook-connect-form').addEventListener('submit', connectOutlook);
document.getElementById('outlook-sync-btn').addEventListener('click', syncOutlook);
document.getElementById('outlook-disconnect-btn').addEventListener('click', async () => {
  if (!confirm('断开 Outlook 并删除本机加密令牌？已创建的日历事件不会删除。')) return;
  try { await api.outlookDisconnect(); await loadOutlook(); toast('Outlook 已断开'); } catch (error) { toast(error.message, true); }
});

initialize();
setInterval(() => loadOutlook().catch(() => {}), 15 * 60 * 1000);
