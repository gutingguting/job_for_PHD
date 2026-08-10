import { api } from './api.js';

const escapeHTML = value => String(value ?? '').replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]);

export class PostdocPipeline {
  constructor({ toast, onCount }) {
    this.toast = toast;
    this.onCount = onCount;
    this.items = [];
    this.statuses = [];
    this.form = document.getElementById('postdoc-form');
    this.bind();
  }

  bind() {
    document.getElementById('postdoc-add-btn').addEventListener('click', () => this.open());
    document.getElementById('postdoc-close-btn').addEventListener('click', () => this.close());
    document.getElementById('postdoc-form-cancel').addEventListener('click', () => this.close());
    document.getElementById('postdoc-filter').addEventListener('change', () => this.render());
    document.getElementById('postdoc-search').addEventListener('input', () => this.render());
    this.form.addEventListener('submit', event => this.submit(event));
    document.querySelectorAll('[data-postdoc-preset]').forEach(button => button.addEventListener('click', () => {
      this.open(); document.getElementById('postdoc-institute').value = button.dataset.postdocPreset;
    }));
    document.querySelectorAll('[data-research-preset]').forEach(button => button.addEventListener('click', () => {
      this.open(); document.getElementById('postdoc-fit').value = button.dataset.researchPreset;
    }));
  }

  async load() {
    const response = await api.postdocs();
    this.items = response.postdocs;
    this.statuses = response.statuses;
    const filters = document.getElementById('postdoc-filter');
    const statusInput = document.getElementById('postdoc-status');
    filters.innerHTML = '<option value="">全部阶段</option>' + this.statuses.map(value => `<option>${escapeHTML(value)}</option>`).join('');
    statusInput.innerHTML = this.statuses.map(value => `<option>${escapeHTML(value)}</option>`).join('');
    this.render(); this.onCount(this.items.filter(item => !['Closed'].includes(item.status)).length);
  }

  render() {
    const filter = document.getElementById('postdoc-filter').value;
    const query = document.getElementById('postdoc-search').value.trim().toLowerCase();
    const visible = this.items.filter(item => (!filter || item.status === filter) && (!query || [item.pi_group, item.institute, item.research_fit, item.position_title].join(' ').toLowerCase().includes(query)));
    const counts = Object.fromEntries(this.statuses.map(status => [status, this.items.filter(item => item.status === status).length]));
    document.getElementById('postdoc-metrics').innerHTML = [
      ['Prospect', '待研究'], ['Contacted', '已联系 PI'], ['Replied', '收到回复'], ['Interview', '面试中'],
    ].map(([status, label]) => `<article class="metric-card"><span>${label}</span><strong>${counts[status] || 0}</strong><small>${status}</small></article>`).join('');
    document.getElementById('postdoc-list').innerHTML = visible.length ? visible.map(item => this.card(item)).join('') : '<div class="empty-state">还没有符合筛选条件的博士后记录。新增 PI、课题组或公开职位后会出现在这里。</div>';
    document.querySelectorAll('[data-postdoc-edit]').forEach(button => button.addEventListener('click', () => this.open(this.items.find(item => item.id === button.dataset.postdocEdit))));
    document.querySelectorAll('[data-postdoc-status]').forEach(select => select.addEventListener('change', async () => {
      try { await api.updatePostdoc(select.dataset.postdocStatus, { status: select.value }); await this.load(); this.toast('博士后阶段已更新'); }
      catch (error) { this.toast(error.message, true); }
    }));
  }

  card(item) {
    const chips = [item.opportunity_type === 'cold_email' ? '套磁' : '公开职位', item.funding_status, item.research_fit].filter(Boolean);
    return `<article class="record-card"><div class="record-top"><div><div class="record-title">${escapeHTML(item.pi_group || item.position_title || '未命名机会')}</div><div class="record-sub">${escapeHTML(item.institute)}${item.country_region ? ` · ${escapeHTML(item.country_region)}` : ''}</div></div><div class="record-actions"><select data-postdoc-status="${item.id}" aria-label="博士后阶段">${this.statuses.map(status => `<option${status === item.status ? ' selected' : ''}>${escapeHTML(status)}</option>`).join('')}</select><button class="button secondary" data-postdoc-edit="${item.id}">编辑</button></div></div><div class="chips">${chips.map(value => `<span class="chip">${escapeHTML(value)}</span>`).join('')}</div><div class="record-details"><div><strong>回复</strong>${escapeHTML(item.reply_summary || '暂无')}</div><div><strong>材料</strong>Research statement: ${escapeHTML(item.research_statement_status || '未配置')}<br>推荐信: ${escapeHTML(item.reference_letters_status || '未配置')}</div><div><strong>下一步</strong>${escapeHTML(item.next_action || '待设置')}${item.follow_up_date ? `<br>${escapeHTML(item.follow_up_date)}` : ''}</div></div></article>`;
  }

  open(item = null) {
    this.form.reset();
    document.getElementById('postdoc-id').value = item?.id || '';
    document.getElementById('postdoc-form-title').textContent = item ? '编辑博士后机会' : '新增博士后机会';
    const map = { pi_group: 'pi', institute: 'institute', country_region: 'country', research_fit: 'fit', funding_status: 'funding', opportunity_type: 'type', position_title: 'title', source_url: 'url', status: 'status', contacted_date: 'contacted', interview_date: 'interview', follow_up_date: 'followup', research_statement_status: 'statement', reference_letters_status: 'letters', reply_summary: 'reply', next_action: 'next', notes: 'notes' };
    if (item) for (const [key, suffix] of Object.entries(map)) document.getElementById(`postdoc-${suffix}`).value = item[key] || '';
    this.form.classList.remove('hidden'); document.getElementById('postdoc-institute').focus();
  }

  close() { this.form.classList.add('hidden'); }

  async submit(event) {
    event.preventDefault();
    const id = document.getElementById('postdoc-id').value;
    const value = {
      pi_group: document.getElementById('postdoc-pi').value, institute: document.getElementById('postdoc-institute').value,
      country_region: document.getElementById('postdoc-country').value, research_fit: document.getElementById('postdoc-fit').value,
      funding_status: document.getElementById('postdoc-funding').value, opportunity_type: document.getElementById('postdoc-type').value,
      position_title: document.getElementById('postdoc-title').value, source_url: document.getElementById('postdoc-url').value,
      status: document.getElementById('postdoc-status').value, contacted_date: document.getElementById('postdoc-contacted').value,
      interview_date: document.getElementById('postdoc-interview').value, follow_up_date: document.getElementById('postdoc-followup').value,
      research_statement_status: document.getElementById('postdoc-statement').value, reference_letters_status: document.getElementById('postdoc-letters').value,
      reply_summary: document.getElementById('postdoc-reply').value, next_action: document.getElementById('postdoc-next').value,
      notes: document.getElementById('postdoc-notes').value, last_verified: new Date().toISOString().slice(0, 10),
    };
    try { if (id) await api.updatePostdoc(id, value); else await api.createPostdoc(value); this.close(); await this.load(); this.toast('博士后记录已保存'); }
    catch (error) { this.toast(error.message, true); }
  }
}
