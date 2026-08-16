import { api } from './api.js';

const escapeHTML = value => String(value ?? '').replace(/[&<>\"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;' })[char]);

export class PrefillCenter {
  constructor({ toast }) {
    this.toast = toast;
    this.state = { facts: { items: [] }, questions: { items: [] }, imports: { items: [] } };
    document.getElementById('prefill-pair-btn').addEventListener('click', () => this.createPair());
    document.getElementById('prefill-save-btn').addEventListener('click', () => this.save());
  }

  async load() {
    const response = await api.prefill();
    this.state = response;
    this.render();
  }

  render() {
    const facts = this.state.facts?.items || [];
    const questions = this.state.questions?.items || [];
    const imports = this.state.imports?.items || [];
    const conflicts = imports.flatMap(item => item.conflicts || []).filter(item => item.status === 'pending');
    document.getElementById('prefill-fact-count').textContent = facts.length;
    document.getElementById('prefill-question-count').textContent = questions.length;
    document.getElementById('prefill-import-count').textContent = imports.length;
    document.getElementById('prefill-conflict-count').textContent = conflicts.length;
    document.getElementById('prefill-facts').innerHTML = facts.length ? facts.map(item => `<label class="prefill-row"><span><strong>${escapeHTML(item.label || item.key)}</strong><small>${escapeHTML([item.employer, item.ats].filter(Boolean).join(' · ') || '通用')}</small></span><input data-prefill-fact="${item.id}" value="${escapeHTML(item.value)}"></label>`).join('') : '<div class="empty-state compact">尚未从申请表导入字段。</div>';
    document.getElementById('prefill-questions').innerHTML = questions.length ? questions.map(item => `<label class="prefill-row question"><span><strong>${escapeHTML(item.question)}</strong><small>${escapeHTML([item.employer, item.ats].filter(Boolean).join(' · ') || '通用')}</small></span><textarea rows="3" data-prefill-question="${item.id}">${escapeHTML(item.answer)}</textarea></label>`).join('') : '<div class="empty-state compact">尚未保存用人单位问题。</div>';
    document.getElementById('prefill-imports').innerHTML = imports.length ? imports.map(item => this.importCard(item)).join('') : '<div class="empty-state compact">尚未采集任何申请表。</div>';
    document.querySelectorAll('[data-conflict-choice]').forEach(button => button.addEventListener('click', () => this.resolve(button)));
  }

  importCard(item) {
    const pending = (item.conflicts || []).filter(value => value.status === 'pending');
    return `<article class="record-card"><div class="record-top"><div><div class="record-title">${escapeHTML(item.employer || item.page_title || '申请表')}</div><div class="record-sub">${escapeHTML((item.ats || 'generic').toUpperCase())} · ${escapeHTML(new Date(item.imported_at).toLocaleString('zh-CN'))}</div></div><span class="chip ${pending.length ? 'warn' : 'good'}">${pending.length ? `待确认 ${pending.length}` : '已归档'}</span></div><div class="import-stats">识别 ${item.recognized_count} · 保存 ${item.saved_count} · 敏感排除 ${item.excluded_count} · 未映射问答 ${item.unrecognized_count}</div>${pending.map(conflict => `<div class="conflict-card"><strong>${escapeHTML(conflict.label)}</strong><div class="conflict-values"><span>现有：${escapeHTML(conflict.existing_value)}</span><span>导入：${escapeHTML(conflict.imported_value)}</span></div><div class="form-actions"><button class="button ghost" data-import-id="${item.id}" data-conflict-id="${conflict.id}" data-conflict-choice="existing">保留现有</button><button class="button secondary" data-import-id="${item.id}" data-conflict-id="${conflict.id}" data-conflict-choice="imported">采用导入值</button></div></div>`).join('')}</article>`;
  }

  async createPair() {
    try {
      const response = await api.createPrefillPair();
      document.getElementById('prefill-pair-code').textContent = response.pairing.code;
      this.toast('配对码已生成，十分钟内有效');
    } catch (error) { this.toast(error.message, true); }
  }

  async save() {
    const payload = {
      facts: [...document.querySelectorAll('[data-prefill-fact]')].map(input => ({ id: input.dataset.prefillFact, value: input.value.trim() })),
      questions: [...document.querySelectorAll('[data-prefill-question]')].map(input => ({ id: input.dataset.prefillQuestion, answer: input.value.trim(), confirmed: true })),
    };
    const button = document.getElementById('prefill-save-btn'); button.disabled = true;
    try { await api.savePrefill(payload); await this.load(); this.toast('预填写资料和答案库已保存'); }
    catch (error) { this.toast(error.message, true); }
    finally { button.disabled = false; }
  }

  async resolve(button) {
    button.disabled = true;
    try {
      await api.resolvePrefillConflicts({ import_id: button.dataset.importId, decisions: [{ id: button.dataset.conflictId, choice: button.dataset.conflictChoice }] });
      await this.load(); this.toast('冲突已处理');
    } catch (error) { button.disabled = false; this.toast(error.message, true); }
  }
}
