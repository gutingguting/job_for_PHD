import { api } from './api.js';

const STEP_LABELS = ['欢迎与隐私', '简历管理', '基本资料', '教育与状态', '求职目标', '授权与规则', '检查与完成'];
const clone = value => JSON.parse(JSON.stringify(value));
const get = (object, path) => path.split('.').reduce((value, key) => value?.[key], object);
const set = (object, path, value) => {
  const keys = path.split('.'); let cursor = object;
  keys.slice(0, -1).forEach(key => { if (!cursor[key] || typeof cursor[key] !== 'object') cursor[key] = {}; cursor = cursor[key]; });
  cursor[keys.at(-1)] = value;
};
const escapeHTML = value => String(value ?? '').replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]);

export class ProfileCenter {
  constructor({ toast, onReadiness, navigate }) {
    this.toast = toast; this.onReadiness = onReadiness; this.navigate = navigate;
    this.profile = {}; this.originalProfile = {}; this.preferences = {}; this.resumes = []; this.readiness = {};
    this.step = 0; this.tagValues = new Map(); this.prefTagValues = new Map();
    this.bindStatic();
  }

  bindStatic() {
    document.getElementById('profile-steps').innerHTML = STEP_LABELS.map((label, index) => `<li><button type="button" data-step-button="${index}">${index + 1}. ${label}</button></li>`).join('');
    document.querySelectorAll('[data-step-button]').forEach(button => button.addEventListener('click', () => this.showStep(Number(button.dataset.stepButton))));
    document.getElementById('profile-prev').addEventListener('click', () => this.showStep(this.step - 1));
    document.getElementById('profile-next').addEventListener('click', async () => { if (await this.save()) this.showStep(this.step + 1); });
    document.getElementById('profile-save-later').addEventListener('click', () => this.save(true));
    document.getElementById('complete-onboarding-btn').addEventListener('click', () => this.complete());
    document.getElementById('education-add-btn').addEventListener('click', () => { this.profile.education ||= []; this.profile.education.push({}); this.renderEducation(); });
    document.getElementById('resume-upload-form').addEventListener('submit', event => this.uploadResume(event));
    const dropzone = document.getElementById('resume-dropzone');
    for (const name of ['dragenter', 'dragover']) dropzone.addEventListener(name, event => { event.preventDefault(); dropzone.classList.add('dragging'); });
    for (const name of ['dragleave', 'drop']) dropzone.addEventListener(name, event => { event.preventDefault(); dropzone.classList.remove('dragging'); });
    dropzone.addEventListener('drop', event => { const [file] = event.dataTransfer.files; if (file) document.getElementById('resume-file').files = event.dataTransfer.files; });
    this.initializeTagFields('[data-tag-field]', this.tagValues, 'tagField');
    this.initializeTagFields('[data-pref-tags]', this.prefTagValues, 'prefTags');
  }

  initializeTagFields(selector, store, datasetKey) {
    document.querySelectorAll(selector).forEach(container => {
      const path = container.dataset[datasetKey];
      store.set(path, []);
      const input = container.querySelector('input');
      const add = () => { const value = input.value.trim(); if (!value) return; const values = store.get(path); if (!values.includes(value)) values.push(value); input.value = ''; this.renderTagField(container, store, path); };
      container.querySelector('.tag-input-row button').addEventListener('click', add);
      input.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); add(); } });
    });
  }

  renderTagField(container, store, path) {
    const values = store.get(path) || [];
    container.querySelector('.tag-list').innerHTML = values.map((value, index) => `<span class="tag-item">${escapeHTML(value)}<button type="button" data-tag-up="${index}" title="提高优先级">↑</button><button type="button" data-tag-down="${index}" title="降低优先级">↓</button><button type="button" data-tag-remove="${index}" title="移除">×</button></span>`).join('');
    container.querySelectorAll('[data-tag-remove]').forEach(button => button.addEventListener('click', () => { values.splice(Number(button.dataset.tagRemove), 1); this.renderTagField(container, store, path); }));
    container.querySelectorAll('[data-tag-up]').forEach(button => button.addEventListener('click', () => { const index = Number(button.dataset.tagUp); if (index > 0) [values[index - 1], values[index]] = [values[index], values[index - 1]]; this.renderTagField(container, store, path); }));
    container.querySelectorAll('[data-tag-down]').forEach(button => button.addEventListener('click', () => { const index = Number(button.dataset.tagDown); if (index < values.length - 1) [values[index + 1], values[index]] = [values[index], values[index + 1]]; this.renderTagField(container, store, path); }));
  }

  async load() {
    const [profileResponse, preferenceResponse, resumeResponse, onboardingResponse] = await Promise.all([api.profile(), api.preferences(), api.resumes(), api.onboarding()]);
    this.profile = clone(profileResponse.profile); this.originalProfile = clone(profileResponse.profile);
    this.preferences = clone(preferenceResponse.preferences); this.resumes = resumeResponse.resumes; this.readiness = profileResponse.readiness;
    this.populate();
    this.showStep(Number(onboardingResponse.onboarding?.current_step || 0));
    return this.readiness;
  }

  populate() {
    document.querySelectorAll('[data-profile]').forEach(input => {
      const value = get(this.profile, input.dataset.profile);
      if (input.dataset.tristate !== undefined) input.value = value === true ? 'true' : value === false ? 'false' : '';
      else input.value = value ?? '';
    });
    document.querySelectorAll('[data-preference]').forEach(input => { input.value = get(this.preferences, input.dataset.preference) ?? ''; });
    document.getElementById('postdoc-enabled').checked = this.preferences.postdoc?.enabled === true;
    document.querySelectorAll('[data-tag-field]').forEach(container => { const path = container.dataset.tagField; this.tagValues.set(path, clone(get(this.profile, path) || [])); this.renderTagField(container, this.tagValues, path); });
    document.querySelectorAll('[data-pref-tags]').forEach(container => { const path = container.dataset.prefTags; this.prefTagValues.set(path, clone(get(this.preferences, path) || [])); this.renderTagField(container, this.prefTagValues, path); });
    this.renderEducation(); this.renderResumes(); this.renderReview();
  }

  renderEducation() {
    const list = document.getElementById('education-list');
    const education = this.profile.education ||= [];
    list.innerHTML = education.length ? education.map((item, index) => `<article class="education-card" data-education-index="${index}"><button class="education-remove" type="button" data-remove-education="${index}">移除</button><div class="form-grid two"><label>学校 / 机构<input data-education="institution" value="${escapeHTML(item.institution || '')}"></label><label>院系 / 研究所<input data-education="affiliation" value="${escapeHTML(item.affiliation || item.school || '')}"></label><label>专业<input data-education="program" value="${escapeHTML(item.program || '')}"></label><label>学位 / 培养类型<input data-education="degree_or_track" value="${escapeHTML(item.degree_or_track || '')}"></label><label>开始时间<input type="month" data-education="start_date" value="${escapeHTML(item.start_date || '')}"></label><label>结束 / 预计结束<input type="month" data-education="expected_end_date" value="${escapeHTML(item.expected_end_date || item.end_date || '')}"></label></div></article>`).join('') : '<div class="empty-state">尚未添加教育经历。</div>';
    document.querySelectorAll('[data-remove-education]').forEach(button => button.addEventListener('click', () => { this.captureEducation(); education.splice(Number(button.dataset.removeEducation), 1); this.renderEducation(); }));
  }

  captureEducation() {
    this.profile.education = [...document.querySelectorAll('[data-education-index]')].map(card => Object.fromEntries([...card.querySelectorAll('[data-education]')].map(input => [input.dataset.education, input.value.trim()])));
  }

  renderResumes() {
    const active = this.resumes.filter(item => !item.archived);
    document.getElementById('resume-list').innerHTML = active.length ? active.map(item => `<article class="resume-card"><div><strong>${escapeHTML(item.version || item.original_name)}</strong><br><small>${escapeHTML(item.original_name)} · ${(item.size / 1024).toFixed(0)} KB</small><div class="chips">${(item.role_families || []).map(role => `<span class="chip">${escapeHTML(role)}</span>`).join('')}</div></div><button class="button ghost" type="button" data-archive-resume="${item.id}">归档</button></article>`).join('') : '<div class="empty-state">尚未上传简历。</div>';
    document.querySelectorAll('[data-archive-resume]').forEach(button => button.addEventListener('click', async () => {
      if (!confirm('归档这份简历？文件会保留，但不再用于路由。')) return;
      try { await api.archiveResume(button.dataset.archiveResume); await this.reloadResumes(); this.toast('简历已归档'); }
      catch (error) { this.toast(error.message, true); }
    }));
  }

  showStep(index) {
    this.step = Math.max(0, Math.min(STEP_LABELS.length - 1, index));
    document.querySelectorAll('.wizard-step').forEach(section => section.classList.toggle('hidden', Number(section.dataset.step) !== this.step));
    document.querySelectorAll('#profile-steps li').forEach((item, itemIndex) => item.classList.toggle('active', itemIndex === this.step));
    document.getElementById('profile-prev').disabled = this.step === 0;
    document.getElementById('profile-next').classList.toggle('hidden', this.step === STEP_LABELS.length - 1);
    if (this.step === STEP_LABELS.length - 1) this.renderReview();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  collect() {
    document.querySelectorAll('[data-profile]').forEach(input => {
      const value = input.dataset.tristate !== undefined ? (input.value === '' ? null : input.value === 'true') : input.value.trim();
      set(this.profile, input.dataset.profile, value);
    });
    this.captureEducation();
    for (const [path, values] of this.tagValues) set(this.profile, path, clone(values));
    document.querySelectorAll('[data-preference]').forEach(input => set(this.preferences, input.dataset.preference, input.value));
    this.preferences.postdoc ||= {};
    this.preferences.postdoc.enabled = document.getElementById('postdoc-enabled').checked;
    for (const [path, values] of this.prefTagValues) set(this.preferences, path, clone(values));
  }

  highImpactChanged() {
    return ['candidate.legal_name', 'candidate.email', 'candidate.phone'].some(path => get(this.profile, path) !== get(this.originalProfile, path));
  }

  async save(leave = false) {
    this.collect();
    if (this.highImpactChanged() && !confirm('你修改了姓名、邮箱或电话等高影响字段。确认这些信息准确吗？')) return false;
    const button = document.getElementById('profile-next'); button.disabled = true;
    try {
      const profileResponse = await api.saveProfile(this.profile);
      const preferenceResponse = await api.savePreferences(this.preferences);
      await api.saveOnboarding(this.step);
      this.profile = clone(profileResponse.profile); this.originalProfile = clone(profileResponse.profile);
      this.preferences = clone(preferenceResponse.preferences); this.readiness = preferenceResponse.readiness;
      this.onReadiness(this.readiness); this.renderReview();
      this.message('草稿已安全保存到本机。');
      if (leave) this.navigate('dashboard');
      return true;
    } catch (error) {
      this.message(error.details?.map(item => item.message).join('；') || error.message, true); return false;
    } finally { button.disabled = false; }
  }

  async reloadResumes() {
    const response = await api.resumes(); this.resumes = response.resumes; this.readiness = response.readiness; this.renderResumes(); this.renderReview(); this.onReadiness(this.readiness);
  }

  async uploadResume(event) {
    event.preventDefault();
    const form = event.currentTarget; const submit = form.querySelector('button[type="submit"], button:not([type])');
    const file = document.getElementById('resume-file').files[0];
    if (!file) return;
    const payload = new FormData(); payload.append('resume', file); payload.append('version', document.getElementById('resume-version').value); payload.append('role_families', document.getElementById('resume-roles').value); payload.append('use_when', document.getElementById('resume-use-when').value);
    submit.disabled = true; submit.textContent = '正在本地解析…';
    try {
      const response = await api.uploadResume(payload); form.reset(); await this.reloadResumes(); this.renderSuggestions(response.suggestions); this.toast('简历已上传，候选字段等待确认');
    } catch (error) { this.toast(error.message, true); }
    finally { submit.disabled = false; submit.textContent = '上传并解析'; }
  }

  renderSuggestions(result) {
    const box = document.getElementById('resume-suggestions'); box.classList.remove('hidden');
    if (result.requires_ocr) { box.innerHTML = '<strong>未提取到足够文本</strong><p>这可能是扫描版 PDF。请换用 DOCX 或文本型 PDF。</p>'; return; }
    box.innerHTML = `<strong>本地解析建议</strong><p>勾选后才会写入资料；来源均为刚上传的简历。</p>${result.candidates.length ? result.candidates.map((item, index) => `<label class="suggestion-row"><input type="checkbox" data-suggestion="${index}"><code>${escapeHTML(item.field)}</code><span>${escapeHTML(item.value)}</span><small>${escapeHTML(item.confidence)}</small></label>`).join('') : '<p>没有发现可安全预填的基础字段。</p>'}<button class="button secondary" id="apply-suggestions" type="button">应用选中字段</button>`;
    document.getElementById('apply-suggestions').addEventListener('click', () => {
      box.querySelectorAll('[data-suggestion]:checked').forEach(input => { const item = result.candidates[Number(input.dataset.suggestion)]; set(this.profile, item.field, item.value); });
      this.populate(); this.showStep(2); this.message('建议已填入表单，请核对后保存。');
    });
  }

  renderReview() {
    const readiness = this.readiness || {};
    const leadMissing = readiness.missing?.lead_finding || [];
    const appMissing = readiness.missing?.application || [];
    document.getElementById('readiness-review').innerHTML = `<div class="readiness-review"><article class="review-card ${readiness.lead_finding_ready ? 'good' : ''}"><h3>${readiness.lead_finding_ready ? '✓ 找岗位已就绪' : '找岗位尚未就绪'}</h3><p>${leadMissing.length ? `仍缺少：${leadMissing.join('、')}` : '简历、目标岗位、地点、工作许可和避投规则已配置。'}</p></article><article class="review-card"><h3>${readiness.application_facts_ready ? '✓ 投递事实已完整' : '投递前仍需检查'}</h3><p>${appMissing.length ? `仍缺少：${appMissing.join('、')}` : '基础事实完整。'} 即使资料完整，最终提交仍未自动授权。</p></article></div>`;
  }

  async complete() {
    if (!(await this.save())) return;
    try { const response = await api.completeOnboarding(); this.readiness = response.readiness; this.onReadiness(this.readiness); this.toast('最低配置已确认'); this.navigate('dashboard'); }
    catch (error) { this.message(error.details?.join('、') || error.message, true); }
  }

  message(text, error = false) { const box = document.getElementById('profile-message'); box.textContent = text; box.classList.remove('hidden'); box.classList.toggle('error', error); }
}
