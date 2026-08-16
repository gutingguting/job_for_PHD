const crypto = require('crypto');
const path = require('path');
const {
  AGENT_ROOT, PROFILE_PATH, PREFILL_FACTS_PATH, PREFILL_QUESTIONS_PATH,
  PREFILL_IMPORTS_PATH, PREFILL_MAPPINGS_PATH, PREFILL_PAIRING_PATH,
} = require('./config');
const { readJSON, writeJSON, atomicWrite } = require('./storage');
const { validateProfile } = require('./readiness');

const MAX_FIELDS = 500;
const MAX_VALUE = 12000;
const PAIR_TTL_MS = 10 * 60 * 1000;
const TOKEN_TTL_MS = 180 * 24 * 60 * 60 * 1000;
const MANAGED_START = '<!-- job_for_PHD:prefill:start -->';
const MANAGED_END = '<!-- job_for_PHD:prefill:end -->';

const SENSITIVE = /(?:身份证|证件号|证件类型|护照|出生|生日|年龄|详细地址|家庭住址|户籍地址|民族|种族|宗教|政治面貌|婚姻|健康|残疾|疾病|银行卡|银行账号|社保|公积金|紧急联系人|性别|gender|sex|birth|date of birth|passport|national id|government id|street address|home address|ethnicity|race|religion|marital|disability|medical|bank account|social security)/i;
const FORBIDDEN = /(?:密码|验证码|校验码|captcha|verification code|one.?time|otp|同意|声明|隐私政策|用户协议|consent|agree to|terms)/i;

const FIELD_MAP = [
  { path: 'candidate.legal_name', key: 'legal_name', aliases: ['法定姓名', '姓名', '中文姓名', 'name', 'full name', 'legal name'] },
  { path: 'candidate.english_name', key: 'english_name', aliases: ['英文名', '英文姓名', 'english name'] },
  { path: 'candidate.email', key: 'email', aliases: ['邮箱', '电子邮箱', 'email', 'e-mail'] },
  { path: 'candidate.phone', key: 'phone', aliases: ['手机', '手机号', '联系电话', '电话', 'mobile', 'phone'] },
  { path: 'candidate.current_location', key: 'current_location', aliases: ['当前城市', '现居城市', '所在城市', 'current city', 'current location'] },
  { path: 'candidate.linkedin_url', key: 'linkedin_url', aliases: ['linkedin'] },
  { path: 'candidate.github_url', key: 'github_url', aliases: ['github'] },
  { path: 'candidate.portfolio_url', key: 'portfolio_url', aliases: ['作品集', 'portfolio', '个人主页', 'personal website'] },
  { path: 'current_status.expected_graduation', key: 'expected_graduation', aliases: ['预计毕业', '毕业时间', 'graduation date', 'expected graduation'] },
  { path: 'current_status.available_start_date', key: 'available_start_date', aliases: ['可入职时间', '到岗时间', '入职日期', 'available start', 'start date'] },
  { path: 'work_authorization.current_authorization', key: 'work_authorization', aliases: ['工作许可', '工作授权', 'work authorization', 'authorized to work'] },
  { path: 'work_authorization.requires_sponsorship_now', key: 'sponsorship_now', aliases: ['当前需要签证支持', 'require sponsorship now'] },
  { path: 'work_authorization.requires_sponsorship_in_future', key: 'sponsorship_future', aliases: ['未来需要签证支持', 'require sponsorship in the future'] },
];

function normalize(value) {
  return String(value || '').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
}

function clean(value, max = MAX_VALUE) {
  return String(value ?? '').replace(/\u0000/g, '').trim().slice(0, max);
}

function get(object, dotted) {
  return dotted.split('.').reduce((value, key) => value?.[key], object);
}

function set(object, dotted, value) {
  const keys = dotted.split('.');
  let cursor = object;
  for (const key of keys.slice(0, -1)) cursor = cursor[key] ||= {};
  cursor[keys.at(-1)] = value;
}

function classification(field) {
  const label = clean([field.label, field.name, field.placeholder, field.section].filter(Boolean).join(' '), 2000);
  const type = clean(field.type, 50).toLowerCase();
  if (type === 'password' || FORBIDDEN.test(label)) return { excluded: true, reason: 'credential_or_consent' };
  if (SENSITIVE.test(label)) return { excluded: true, reason: 'sensitive_personal_data' };
  if (type === 'file') return { excluded: false, filenameOnly: true };
  return { excluded: false, filenameOnly: false };
}

function mappedField(label) {
  const needle = normalize(label);
  if (!needle) return null;
  return FIELD_MAP.map(item => ({
    item,
    score: Math.max(0, ...item.aliases.map(alias => {
      const candidate = normalize(alias);
      return needle === candidate ? 100 : needle.includes(candidate) || candidate.includes(needle) ? 70 : 0;
    })),
  })).sort((left, right) => right.score - left.score).find(match => match.score > 0)?.item || null;
}

function hashToken(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function createPairingCode() {
  const code = String(crypto.randomInt(100000, 1000000));
  const current = readJSON(PREFILL_PAIRING_PATH, {});
  writeJSON(PREFILL_PAIRING_PATH, {
    ...current,
    pending_code_hash: hashToken(code),
    pending_expires_at: new Date(Date.now() + PAIR_TTL_MS).toISOString(),
  });
  return { code, expires_at: new Date(Date.now() + PAIR_TTL_MS).toISOString() };
}

function exchangePairingCode(code, extensionId) {
  const current = readJSON(PREFILL_PAIRING_PATH, {});
  if (!current.pending_code_hash || Date.parse(current.pending_expires_at || 0) < Date.now() || hashToken(code) !== current.pending_code_hash) {
    throw Object.assign(new Error('配对码无效或已过期'), { status: 401 });
  }
  const token = crypto.randomBytes(32).toString('base64url');
  writeJSON(PREFILL_PAIRING_PATH, {
    schema_version: 1,
    extension_id: clean(extensionId, 128),
    token_hash: hashToken(token),
    paired_at: new Date().toISOString(),
    token_expires_at: new Date(Date.now() + TOKEN_TTL_MS).toISOString(),
  });
  return { token, expires_at: new Date(Date.now() + TOKEN_TTL_MS).toISOString() };
}

function verifyToken(token, extensionId = '') {
  const current = readJSON(PREFILL_PAIRING_PATH, {});
  return Boolean(token && current.token_hash && hashToken(token) === current.token_hash
    && Date.parse(current.token_expires_at || 0) > Date.now()
    && (!current.extension_id || !extensionId || current.extension_id === extensionId));
}

function readState() {
  return {
    facts: readJSON(PREFILL_FACTS_PATH, { schema_version: 1, items: [] }),
    questions: readJSON(PREFILL_QUESTIONS_PATH, { schema_version: 1, items: [] }),
    imports: readJSON(PREFILL_IMPORTS_PATH, { schema_version: 1, items: [] }),
    mappings: readJSON(PREFILL_MAPPINGS_PATH, { schema_version: 1, items: [] }),
  };
}

function mdCell(value) {
  return clean(value).replace(/\r?\n/g, '<br>').replace(/\|/g, '\\|');
}

function syncAnswerBank(questions) {
  const filePath = path.join(AGENT_ROOT, 'answer_bank.md');
  const current = require('fs').existsSync(filePath) ? require('fs').readFileSync(filePath, 'utf8') : '# Answer Bank\n';
  atomicWrite(filePath, renderManagedAnswerBank(current, questions));
}

function renderManagedAnswerBank(current, questions) {
  const rows = (questions.items || []).filter(item => item.confirmed !== false && item.answer).map(item =>
    `| ${mdCell(item.question)} | ${mdCell(item.answer)} | ${mdCell([item.employer, item.ats].filter(Boolean).join(' / ') || '通用')} |`
  ).join('\n');
  const managed = `${MANAGED_START}\n## Confirmed Prefill Answers\n\n| Question | Confirmed answer | Scope |\n|---|---|---|\n${rows || '| 暂无 |  |  |'}\n${MANAGED_END}`;
  const expression = new RegExp(`${MANAGED_START}[\\s\\S]*?${MANAGED_END}`, 'm');
  return expression.test(current) ? current.replace(expression, managed) : `${current.trim()}\n\n${managed}\n`;
}

function importPage(payload) {
  const fields = Array.isArray(payload.fields) ? payload.fields.slice(0, MAX_FIELDS) : [];
  const page = payload.page || {};
  const profile = readJSON(PROFILE_PATH, {});
  const state = readState();
  const now = new Date().toISOString();
  const importId = crypto.randomUUID();
  const conflicts = [];
  let excluded = 0;
  let saved = 0;
  let unrecognized = 0;

  for (const raw of fields) {
    const field = {
      label: clean(raw.label, 1000), name: clean(raw.name, 500), type: clean(raw.type, 100),
      value: clean(raw.type === 'file' ? (raw.filename || '') : raw.value), section: clean(raw.section, 500),
      placeholder: clean(raw.placeholder, 500),
    };
    if (!field.value) continue;
    const privacy = classification(field);
    if (privacy.excluded) { excluded += 1; continue; }
    const map = mappedField(field.label || field.name || field.placeholder);
    const factKey = map?.key || `custom.${normalize(field.label || field.name).slice(0, 80) || crypto.randomUUID()}`;
    const existingFact = state.facts.items.find(item => item.key === factKey && item.employer === clean(page.employer, 300));
    const profileValue = map ? get(profile, map.path) : undefined;
    if (map && profileValue !== undefined && profileValue !== null && String(profileValue).trim() && String(profileValue).trim() !== field.value) {
      conflicts.push({ id: crypto.randomUUID(), key: factKey, profile_path: map.path, label: field.label, existing_value: String(profileValue), imported_value: field.value, status: 'pending' });
    }
    const fact = {
      id: existingFact?.id || crypto.randomUUID(), key: factKey, profile_path: map?.path || '',
      label: field.label || field.name, value: field.value, type: field.type,
      ats: clean(page.ats, 50), employer: clean(page.employer, 300), source_url: clean(page.url, 2000),
      source: 'user_filled_form', confirmed: true, updated_at: now,
    };
    if (existingFact) Object.assign(existingFact, fact); else state.facts.items.push(fact);

    if (!map) {
      unrecognized += 1;
      const normalizedQuestion = normalize(field.label || field.name);
      const existingQuestion = state.questions.items.find(item => item.normalized_question === normalizedQuestion && item.employer === fact.employer && item.ats === fact.ats);
      const question = {
        id: existingQuestion?.id || crypto.randomUUID(), question: field.label || field.name,
        normalized_question: normalizedQuestion, answer: field.value, ats: fact.ats,
        employer: fact.employer, job_title: clean(page.job_title, 500), source_url: fact.source_url,
        confirmed: true, confirmed_at: now, updated_at: now,
      };
      if (existingQuestion) Object.assign(existingQuestion, question); else state.questions.items.push(question);
    }
    saved += 1;
  }

  const record = {
    id: importId, imported_at: now, ats: clean(page.ats, 50), employer: clean(page.employer, 300),
    job_title: clean(page.job_title, 500), source_url: clean(page.url, 2000), page_title: clean(page.title, 500),
    recognized_count: fields.length, saved_count: saved, excluded_count: excluded,
    unrecognized_count: unrecognized, conflict_count: conflicts.length, conflicts,
  };
  state.imports.items.unshift(record);
  state.imports.items = state.imports.items.slice(0, 100);
  writeJSON(PREFILL_FACTS_PATH, state.facts);
  writeJSON(PREFILL_QUESTIONS_PATH, state.questions);
  writeJSON(PREFILL_IMPORTS_PATH, state.imports);
  syncAnswerBank(state.questions);
  return record;
}

function updateState(payload) {
  const state = readState();
  if (Array.isArray(payload.facts)) {
    for (const update of payload.facts) {
      const item = state.facts.items.find(value => value.id === update.id);
      if (item && !classification({ label: item.label, type: item.type }).excluded) {
        item.value = clean(update.value);
        item.updated_at = new Date().toISOString();
      }
    }
    writeJSON(PREFILL_FACTS_PATH, state.facts);
  }
  if (Array.isArray(payload.questions)) {
    for (const update of payload.questions) {
      const item = state.questions.items.find(value => value.id === update.id);
      if (item) {
        item.answer = clean(update.answer);
        item.confirmed = update.confirmed !== false;
        item.updated_at = new Date().toISOString();
      }
    }
    writeJSON(PREFILL_QUESTIONS_PATH, state.questions);
    syncAnswerBank(state.questions);
  }
  return readState();
}

function resolveConflicts(payload) {
  const imports = readJSON(PREFILL_IMPORTS_PATH, { schema_version: 1, items: [] });
  const profile = readJSON(PROFILE_PATH, {});
  const record = imports.items.find(item => item.id === payload.import_id);
  if (!record) throw Object.assign(new Error('导入记录不存在'), { status: 404 });
  for (const decision of payload.decisions || []) {
    const conflict = (record.conflicts || []).find(item => item.id === decision.id);
    if (!conflict || conflict.status !== 'pending') continue;
    if (decision.choice === 'imported' && conflict.profile_path) {
      const currentValue = get(profile, conflict.profile_path);
      let importedValue = conflict.imported_value;
      if (typeof currentValue === 'boolean') importedValue = /^(?:true|yes|是|需要)$/i.test(importedValue);
      set(profile, conflict.profile_path, importedValue);
    }
    conflict.status = decision.choice === 'imported' ? 'accepted_imported' : 'kept_existing';
    conflict.resolved_at = new Date().toISOString();
  }
  const validationErrors = validateProfile(profile);
  if (validationErrors.length) throw Object.assign(new Error('导入值未通过候选人档案校验'), { status: 422, details: validationErrors });
  writeJSON(PROFILE_PATH, profile);
  writeJSON(PREFILL_IMPORTS_PATH, imports);
  return { profile, import: record };
}

function bundleFor(url, employer = '') {
  const state = readState();
  const profile = readJSON(PROFILE_PATH, {});
  const ats = /mokahr/i.test(url) ? 'moka' : /myworkdayjobs|workday/i.test(url) ? 'workday' : /greenhouse|boards\.greenhouse/i.test(url) ? 'greenhouse' : 'generic';
  const employerKey = normalize(employer || (/\bzte\b/i.test(url) ? '中兴通讯' : ''));
  const inScope = item => !item.employer || !employerKey || normalize(item.employer) === employerKey;
  const core = FIELD_MAP.map(item => ({ key: item.key, label: item.aliases[0], aliases: item.aliases, value: get(profile, item.path) }))
    .filter(item => item.value !== undefined && item.value !== null && String(item.value).trim() !== '');
  const mappingAliases = key => (state.mappings.items || []).filter(item => item.key === key).flatMap(item => item.aliases || []);
  const extras = state.facts.items.filter(item => inScope(item) && !classification({ label: item.label, type: item.type }).excluded).map(item => ({ key: item.key, label: item.label, aliases: [item.label, ...mappingAliases(item.key)], value: item.value, employer: item.employer }));
  const questions = state.questions.items.filter(item => item.confirmed !== false && item.answer && inScope(item) && (!item.ats || item.ats === ats)).map(item => ({ question: item.question, normalized_question: item.normalized_question, answer: item.answer, employer: item.employer, ats: item.ats }));
  return { ats, facts: [...core, ...extras], questions, final_submission_allowed: false };
}

module.exports = {
  classification, mappedField, createPairingCode, exchangePairingCode, verifyToken,
  readState, importPage, updateState, resolveConflicts, bundleFor, syncAnswerBank, renderManagedAnswerBank,
};
