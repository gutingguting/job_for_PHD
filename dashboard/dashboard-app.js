import { api, readCSV } from './api.js';
import { ProfileCenter } from './profile-center.js';
import { PostdocPipeline } from './postdoc.js';

const escapeHTML = value => String(value ?? '').replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]);
const state = { jobs: [], followups: [], readiness: null, activeView: 'dashboard' };
const FRONTEND_VERSION = '1.1.1';
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
  document.getElementById('job-list').innerHTML = visible.length ? visible.map(job => `<article class="record-card"><div class="record-top"><div><div class="record-title">${escapeHTML(job.job_title || '未命名岗位')}</div><div class="record-sub">${escapeHTML(job.company)}${job.location ? ` · ${escapeHTML(job.location)}` : ''}</div></div><div class="record-actions">${job.status === 'Submitted' ? `<button class="button secondary" data-job-end="Offer" data-row="${job.__rowIndex}">Offer</button><button class="button ghost" data-job-end="Rejected" data-row="${job.__rowIndex}">Rejected</button>` : ''}</div></div><div class="chips"><span class="chip ${job.status === 'Submitted' ? 'good' : job.status === 'Needs user' ? 'warn' : ''}">${escapeHTML(job.status || 'Pending')}</span>${[job.category, job.priority, job.fit_label, job.opening_status].filter(Boolean).map(value => `<span class="chip">${escapeHTML(value)}</span>`).join('')}</div><div class="record-details"><div><strong>筛选理由</strong>${escapeHTML(job.status_reason || job.notes || '暂无')}</div><div><strong>下一步</strong>${escapeHTML(job.next_action || '待设置')}</div><div><strong>来源</strong>${job.source_url ? `<a href="${escapeHTML(job.source_url)}" target="_blank" rel="noopener noreferrer">查看公开职位页</a>` : escapeHTML(job.source || '未记录')}</div></div></article>`).join('') : '<div class="empty-state">没有符合当前筛选条件的岗位。</div>';
  document.querySelectorAll('[data-job-end]').forEach(button => button.addEventListener('click', async () => {
    const job = state.jobs[Number(button.dataset.row)];
    if (!job || !confirm(`将 ${job.company} · ${job.job_title} 标记为 ${button.dataset.jobEnd}？`)) return;
    try { await api.updateJobStatus({ rowIndex: job.__rowIndex, company: job.company, job_title: job.job_title, status: button.dataset.jobEnd }); await loadOperationalData(); toast('岗位状态已更新'); }
    catch (error) { toast(error.message, true); }
  }));
}

function localDate(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }

function renderCalendar() {
  const container = document.getElementById('calendar-week'); const today = new Date(); today.setHours(0,0,0,0);
  container.innerHTML = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today); date.setDate(today.getDate() + index); const key = localDate(date);
    const events = state.followups.filter(item => item.date === key && item.status !== 'Done');
    return `<article class="calendar-day ${index === 0 ? 'today' : ''}"><div class="calendar-date">${index === 0 ? '今天 · ' : ''}${date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', weekday: 'short' })}</div>${events.length ? events.map(event => `<div class="calendar-event" data-calendar-row="${event.__rowIndex}"><strong>${escapeHTML(event.time)}</strong> ${escapeHTML(event.event_type)}<br>${escapeHTML(event.company)}</div>`).join('') : '<span class="calendar-empty">暂无安排</span>'}</article>`;
  }).join('');
  document.querySelectorAll('[data-calendar-row]').forEach(element => element.addEventListener('click', () => openCalendar(state.followups.find(item => item.__rowIndex === Number(element.dataset.calendarRow)))));
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

async function loadOperationalData() {
  [state.jobs, state.followups] = await Promise.all([readCSV('job_pool.csv'), readCSV('follow_up.csv')]);
  renderJobs(); renderCalendar(); document.getElementById('last-updated').textContent = `更新于 ${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
}

const postdoc = new PostdocPipeline({ toast, onCount: count => { document.getElementById('metric-postdoc').textContent = count; } });
const profile = new ProfileCenter({ toast, onReadiness: updateReadiness, navigate });

async function initialize() {
  try {
    const health = await api.health();
    if (health.version !== FRONTEND_VERSION) {
      throw new Error(`服务版本不一致：网页为 v${FRONTEND_VERSION}，后台为 v${health.version || '未知'}。请关闭旧服务窗口并重新启动。`);
    }
    const [, readiness] = await Promise.all([loadOperationalData(), profile.load(), postdoc.load()]);
    updateReadiness(readiness);
    document.getElementById('loading-view').classList.add('hidden');
    const requested = location.hash.slice(1);
    navigate(!readiness.lead_finding_ready ? 'profile' : ['dashboard', 'postdoc', 'profile'].includes(requested) ? requested : 'dashboard');
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

initialize();
