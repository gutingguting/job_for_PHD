(() => {
  if (globalThis.__jobForPhdPrefillInstalled) return;
  globalThis.__jobForPhdPrefillInstalled = true;

  const normalize = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
  const visible = element => Boolean(element && (element.offsetWidth || element.offsetHeight || element.getClientRects().length));
  const sensitive = value => /(?:身份证|证件号|护照|出生|生日|详细地址|家庭住址|民族|种族|宗教|政治面貌|婚姻|健康|残疾|银行卡|社保|公积金|紧急联系人|性别|密码|验证码|captcha|otp|同意|声明|隐私|协议|gender|sex|birth|passport|national id|street address|ethnicity|race|religion|marital|disability|medical|bank|consent|terms)/i.test(value);

  function ats() {
    const host = location.hostname;
    if (/mokahr/i.test(host)) return 'moka';
    if (/myworkdayjobs|workday/i.test(host)) return 'workday';
    if (/greenhouse/i.test(host)) return 'greenhouse';
    return 'generic';
  }

  function adapter() {
    return globalThis.jobForPhdAdapters?.[ats()] || globalThis.jobForPhdAdapters?.generic || {
      controls: 'input,select,textarea,[contenteditable="true"],[role="textbox"],[role="combobox"]',
      options: '[role="option"]', group: '[role="group"],.form-item', label: 'label,legend',
    };
  }

  function employer() {
    return /zte|中兴/i.test(`${location.href} ${document.title}`) ? '中兴通讯' : document.title.replace(/(?:careers?|jobs?|招聘|职位|application).*/i, '').trim();
  }

  function labelFor(element) {
    const direct = element.getAttribute('aria-label') || element.getAttribute('data-label');
    if (direct) return direct.trim();
    if (element.id) {
      const linked = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
      if (linked) return linked.innerText.trim();
    }
    const wrapping = element.closest('label');
    if (wrapping) return wrapping.innerText.replace(element.value || '', '').trim();
    const current = adapter();
    const group = element.closest(current.group);
    const candidate = group?.querySelector(current.label);
    return (candidate?.innerText || element.placeholder || element.name || '').trim();
  }

  function sectionFor(element) {
    let cursor = element.parentElement;
    for (let depth = 0; cursor && depth < 6; depth += 1, cursor = cursor.parentElement) {
      const heading = cursor.querySelector(':scope > h1,:scope > h2,:scope > h3,:scope > legend,.section-title');
      if (heading?.innerText) return heading.innerText.trim();
    }
    return '';
  }

  function controls() {
    return [...document.querySelectorAll(adapter().controls)]
      .filter(element => visible(element) && !element.disabled && !['hidden','submit','button','reset','image'].includes((element.type || '').toLowerCase()));
  }

  function valueFor(element) {
    const type = (element.type || '').toLowerCase();
    if (type === 'file') return element.files?.[0]?.name || '';
    if (type === 'checkbox' || type === 'radio') return element.checked ? (element.value || 'true') : '';
    if (element.tagName === 'SELECT') return element.selectedOptions?.[0]?.textContent?.trim() || element.value;
    if (element.isContentEditable) return element.innerText.trim();
    return String(element.value || element.getAttribute('aria-valuetext') || '').trim();
  }

  function extract() {
    const seenRadio = new Set();
    const fields = [];
    for (let element of controls()) {
      const type = (element.type || element.getAttribute('role') || element.tagName).toLowerCase();
      if (type === 'radio') {
        const group = element.name || labelFor(element);
        if (seenRadio.has(group)) continue;
        seenRadio.add(group);
        const selected = controls().find(item => item.type === 'radio' && (item.name || labelFor(item)) === group && item.checked);
        if (!selected) continue;
        element = selected;
      }
      const label = labelFor(element);
      const value = valueFor(element);
      if (!value) continue;
      fields.push({ label, name: element.name || element.id || '', type, value, filename: type === 'file' ? value : '', placeholder: element.placeholder || '', section: sectionFor(element) });
    }
    return {
      page: { url: location.href, title: document.title, ats: ats(), employer: employer(), job_title: document.querySelector('h1,h2')?.innerText?.trim() || '' },
      fields,
    };
  }

  function score(label, candidate) {
    const left = normalize(label), values = [candidate.label, ...(candidate.aliases || []), candidate.question].filter(Boolean).map(normalize);
    if (!left) return 0;
    return Math.max(0, ...values.map(value => left === value ? 100 : left.includes(value) || value.includes(left) ? 70 : 0));
  }

  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const variants = value => {
    if (value === true || String(value).toLowerCase() === 'true') return ['true', 'yes', '是', '需要'];
    if (value === false || String(value).toLowerCase() === 'false') return ['false', 'no', '否', '不需要'];
    return [String(value)];
  };

  async function setNative(element, value) {
    const type = (element.type || '').toLowerCase();
    if (type === 'file' || sensitive(labelFor(element))) return false;
    const role = element.getAttribute('role');
    if (role === 'combobox' && (!['INPUT', 'SELECT'].includes(element.tagName) || element.readOnly)) {
      element.click(); await delay(120);
      const wanted = variants(value).map(normalize);
      const option = [...document.querySelectorAll(adapter().options)].find(item => visible(item) && wanted.some(candidate => normalize(item.innerText) === candidate || normalize(item.innerText).includes(candidate)));
      if (!option) { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return false; }
      option.click(); await delay(30); return true;
    }
    if (role === 'combobox' && element.tagName === 'INPUT' && !element.readOnly) {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      element.focus(); if (setter) setter.call(element, String(value)); else element.value = String(value);
      element.dispatchEvent(new Event('input', { bubbles: true })); await delay(160);
      const wanted = variants(value).map(normalize);
      const option = [...document.querySelectorAll(adapter().options)].find(item => visible(item) && wanted.some(candidate => normalize(item.innerText) === candidate || normalize(item.innerText).includes(candidate)));
      if (option) { option.click(); await delay(30); return true; }
    }
    if (type === 'checkbox' || type === 'radio') {
      const desired = variants(value).map(normalize);
      if (type === 'radio' && !desired.includes(normalize(element.value)) && !desired.includes(normalize(labelFor(element)))) return false;
      element.click();
    } else if (element.tagName === 'SELECT') {
      const wanted = variants(value).map(normalize);
      const option = [...element.options].find(item => wanted.includes(normalize(item.value)) || wanted.includes(normalize(item.textContent)));
      if (!option) return false;
      element.value = option.value;
    } else if (element.isContentEditable) {
      element.focus(); element.innerText = String(value);
    } else {
      let textValue = String(value);
      if (type === 'date' && /^\d{4}-\d{2}$/.test(textValue)) textValue += '-01';
      if (type === 'month' && /^\d{4}-\d{2}-\d{2}$/.test(textValue)) textValue = textValue.slice(0, 7);
      const prototype = element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
      if (setter) setter.call(element, textValue); else element.value = textValue;
    }
    for (const name of ['input', 'change', 'blur']) element.dispatchEvent(new Event(name, { bubbles: true }));
    return true;
  }

  async function fill(bundle) {
    let filled = 0, unchanged = 0, skipped = 0, rejected = 0;
    const seenRadioGroups = new Set();
    const candidates = [...(bundle.facts || []), ...(bundle.questions || []).map(item => ({ ...item, label: item.question, aliases: [item.question], value: item.answer }))];
    for (let element of controls()) {
      if ((element.type || '').toLowerCase() === 'radio') {
        const group = element.name || labelFor(element);
        if (seenRadioGroups.has(group)) continue;
        seenRadioGroups.add(group);
      }
      const label = labelFor(element);
      if (!label || sensitive(label) || (element.type || '').toLowerCase() === 'file') { skipped += 1; continue; }
      const matches = candidates.map(item => ({ item, score: score(label, item) })).filter(item => item.score > 0).sort((a,b) => b.score - a.score);
      if (!matches.length || (matches[1] && matches[0].score === matches[1].score && matches[0].item.value !== matches[1].item.value)) { skipped += 1; continue; }
      const desired = String(matches[0].item.value ?? '');
      if ((element.type || '').toLowerCase() === 'radio') {
        const group = element.name || label;
        const wanted = variants(desired).map(normalize);
        const target = controls().find(item => item.type === 'radio' && (item.name || labelFor(item)) === group && (wanted.includes(normalize(item.value)) || wanted.includes(normalize(labelFor(item)))));
        if (!target) { rejected += 1; continue; }
        element = target;
      }
      const current = valueFor(element);
      if (normalize(current) === normalize(desired)) { unchanged += 1; continue; }
      if (current) { skipped += 1; continue; }
      if (!(await setNative(element, desired))) { rejected += 1; continue; }
      const actual = normalize(valueFor(element));
      const expected = variants(desired).map(normalize);
      const dateCompatible = (element.type === 'date' && actual.startsWith(normalize(desired))) || (element.type === 'month' && normalize(desired).startsWith(actual));
      if (expected.includes(actual) || dateCompatible || ['checkbox','radio'].includes((element.type || '').toLowerCase())) filled += 1;
      else rejected += 1;
    }
    return { filled, unchanged, skipped, rejected, final_submission_clicked: false };
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.source !== 'job_for_PHD') return;
    try {
      if (message.action === 'inspect') sendResponse({ ats: ats(), employer: employer(), field_count: controls().length, url: location.href });
      else if (message.action === 'extract') sendResponse(extract());
      else if (message.action === 'fill') fill(message.bundle || {}).then(sendResponse).catch(error => sendResponse({ error: error.message }));
    } catch (error) { sendResponse({ error: error.message }); }
    return true;
  });
})();
