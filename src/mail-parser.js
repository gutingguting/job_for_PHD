const crypto = require('crypto');
const chrono = require('chrono-node');
const ICAL = require('ical.js');

const INTERVIEW_RE = /面试|笔试|测评|终面|一面|二面|hr\s*面|interview|assessment|screening|technical\s+(?:call|round)|meet(?:ing)?\s+(?:with|invitation)|teams\s+meeting|zoom/i;
const STAGES = [
  [/终面|final\s+(?:round|interview)/i, '终面'],
  [/hr\s*面|human\s+resources/i, 'HR 面'],
  [/二面|second\s+(?:round|interview)/i, '二面'],
  [/一面|first\s+(?:round|interview)/i, '一面'],
  [/笔试|written\s+test/i, '笔试'],
  [/测评|assessment/i, '测评'],
  [/谈薪|compensation|salary\s+discussion/i, '谈薪'],
  [/interview/i, '面试'],
];

function htmlToText(value) {
  return String(value || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function pad(value) { return String(value).padStart(2, '0'); }

function beijingDisplay(date) {
  if (!(date instanceof Date) || Number.isNaN(date.valueOf())) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date);
}

function parseIcs(content) {
  try {
    const root = new ICAL.Component(ICAL.parse(content));
    const component = root.getFirstSubcomponent('vevent');
    if (!component) return null;
    const event = new ICAL.Event(component);
    const start = event.startDate;
    const end = event.endDate;
    const startDate = start.toJSDate();
    const timezoneParameter = component.getFirstProperty('dtstart')?.getParameter('tzid');
    const timezone = timezoneParameter || (start.zone?.tzid && start.zone.tzid !== 'floating' ? start.zone.tzid : 'Asia/Shanghai');
    return {
      date: `${start.year}-${pad(start.month)}-${pad(start.day)}`,
      time: `${pad(start.hour)}:${pad(start.minute)}`,
      end_time: end ? `${pad(end.hour)}:${pad(end.minute)}` : '',
      timezone,
      beijing_time: beijingDisplay(startDate),
      event_type: event.summary || '',
      location: event.location || '',
      meeting_url: event.component.getFirstPropertyValue('url') || '',
    };
  } catch {
    return null;
  }
}

function detectTimezone(text) {
  if (/\b(?:CET|CEST)\b/i.test(text)) return 'Europe/Berlin';
  if (/\bBST\b/i.test(text)) return 'Europe/London';
  if (/\b(?:UTC|GMT)\b/i.test(text)) return 'UTC';
  if (/北京时间|中国标准时间|\bCST\b/i.test(text)) return 'Asia/Shanghai';
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai';
}

function parseTextDate(text, referenceDate) {
  const reference = referenceDate instanceof Date && !Number.isNaN(referenceDate.valueOf()) ? referenceDate : new Date();
  const results = [
    ...chrono.zh.hans.parse(text, reference, { forwardDate: true }),
    ...chrono.en.parse(text, reference, { forwardDate: true }),
  ].sort((a, b) => a.index - b.index);
  const result = results[0];
  if (!result) return null;
  const date = result.start.date();
  const hasTime = result.start.isCertain('hour');
  let endTime = '';
  if (result.end?.isCertain('hour')) {
    const end = result.end.date(); endTime = `${pad(end.getHours())}:${pad(end.getMinutes())}`;
  }
  return {
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: hasTime ? `${pad(date.getHours())}:${pad(date.getMinutes())}` : '',
    end_time: endTime,
    timezone: detectTimezone(text),
    beijing_time: hasTime ? beijingDisplay(date) : '',
  };
}

function lineValue(text, labels) {
  const pattern = new RegExp(`(?:${labels.join('|')})\\s*[:：]\\s*([^\\n]{2,180})`, 'i');
  return text.match(pattern)?.[1]?.trim() || '';
}

function firstUrl(text) {
  const urls = text.match(/https?:\/\/[^\s<>"']+/gi) || [];
  return urls.find(url => /teams|zoom|webex|meet|interview|meeting/i.test(url)) || '';
}

function parseInterviewMessage(message) {
  const subject = String(message.subject || '').trim();
  const body = htmlToText(message.body || message.bodyPreview || '');
  const combined = `${subject}\n${body}`;
  const ics = (message.attachments || []).find(item => /text\/calendar/i.test(item.contentType || '') || /\.ics$/i.test(item.name || ''));
  if (!INTERVIEW_RE.test(combined) && !ics) return null;
  const calendar = ics?.content ? parseIcs(ics.content) : null;
  const parsedDate = calendar || parseTextDate(combined, new Date(message.receivedDateTime || Date.now())) || {};
  const stage = STAGES.find(([pattern]) => pattern.test(combined))?.[1] || calendar?.event_type || '面试';
  const sender = message.from?.emailAddress?.address || message.sender || '';
  const senderName = message.from?.emailAddress?.name || '';
  const meetingUrl = calendar?.meeting_url || firstUrl(combined);
  const result = {
    id: crypto.randomUUID(),
    source_message_id: message.id || '',
    source_internet_message_id: message.internetMessageId || '',
    source_hash: crypto.createHash('sha256').update(`${message.internetMessageId || message.id || ''}|${subject}|${message.receivedDateTime || ''}`).digest('hex'),
    subject,
    sender,
    sender_name: senderName,
    received_at: message.receivedDateTime || '',
    summary: body.slice(0, 240),
    status: 'pending',
    event_type: stage,
    date: parsedDate.date || '',
    time: parsedDate.time || '',
    end_time: parsedDate.end_time || '',
    timezone: parsedDate.timezone || 'Asia/Shanghai',
    beijing_time: parsedDate.beijing_time || '',
    location: calendar?.location || lineValue(body, ['地点', '地址', 'Location', 'Venue']),
    meeting_url: meetingUrl,
    contact: senderName || sender,
    association_type: '',
    record_id: '',
    match_score: 0,
    created_at: new Date().toISOString(),
  };
  return result;
}

function scoreTerms(text, values) {
  let score = 0;
  for (const value of values.filter(Boolean)) {
    const normalized = String(value).trim().toLowerCase();
    if (normalized.length >= 2 && text.includes(normalized)) score += normalized.length >= 6 ? 3 : 2;
  }
  return score;
}

function suggestAssociation(item, jobs, postdocs) {
  const text = `${item.subject} ${item.summary} ${item.sender_name} ${item.sender}`.toLowerCase();
  const candidates = [];
  for (const job of jobs) {
    if (job.status !== 'Submitted') continue;
    candidates.push({ type: 'job', id: job.id, score: scoreTerms(text, [job.company, job.job_title]) });
  }
  for (const postdoc of postdocs) {
    if (postdoc.status === 'Closed') continue;
    candidates.push({ type: 'postdoc', id: postdoc.id, score: scoreTerms(text, [postdoc.institute, postdoc.pi_group, postdoc.position_title]) });
  }
  candidates.sort((a, b) => b.score - a.score);
  if (candidates[0]?.score >= 2) {
    item.association_type = candidates[0].type;
    item.record_id = candidates[0].id;
    item.match_score = candidates[0].score;
  }
  return item;
}

module.exports = { htmlToText, parseIcs, parseInterviewMessage, suggestAssociation };
