const test = require('node:test');
const assert = require('node:assert/strict');
const { parseInterviewMessage, parseIcs, suggestAssociation } = require('../src/mail-parser');
const { addMinutes, graphTimezone, graphEndDate, validateConfirmation, beginConnect } = require('../src/outlook-service');

test('Chinese interview mail produces an editable structured proposal', () => {
  const result = parseInterviewMessage({
    id: 'm1', internetMessageId: '<m1@example.test>', subject: '北京某公司 FPGA 工程师一面通知',
    receivedDateTime: '2026-08-16T01:00:00Z',
    from: { emailAddress: { name: '招聘团队', address: 'hr@example.test' } },
    body: '您好，邀请您于2026年8月20日14:30参加一面。地点：腾讯会议 https://meeting.example.test/123',
  });
  assert.equal(result.date, '2026-08-20');
  assert.equal(result.time, '14:30');
  assert.equal(result.event_type, '一面');
  assert.match(result.meeting_url, /^https:/);
  assert.equal(Object.hasOwn(result, 'body'), false);
});

test('ICS attachment takes precedence and retains its timezone', () => {
  const parsed = parseIcs('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nDTSTART;TZID=Europe/Berlin:20260901T090000\r\nDTEND;TZID=Europe/Berlin:20260901T100000\r\nSUMMARY:Technical Interview\r\nLOCATION:Teams\r\nEND:VEVENT\r\nEND:VCALENDAR');
  assert.equal(parsed.date, '2026-09-01');
  assert.equal(parsed.time, '09:00');
  assert.equal(parsed.timezone, 'Europe/Berlin');
});

test('association suggestions only match submitted jobs and open postdocs', () => {
  const item = { subject: 'CERN detector electronics interview', summary: '', sender: '', sender_name: '' };
  suggestAssociation(item, [{ id: 'j1', company: 'CERN', job_title: 'Engineer', status: 'Pending' }], [{ id: 'p1', institute: 'CERN', pi_group: 'Detector Electronics', position_title: 'Postdoc', status: 'Contacted' }]);
  assert.equal(item.association_type, 'postdoc');
  assert.equal(item.record_id, 'p1');
});

test('calendar helpers default duration and enforce a confirmed association', () => {
  assert.equal(addMinutes('23:30', 60), '00:30');
  assert.equal(graphEndDate('2026-08-20', '23:30', '00:30'), '2026-08-21');
  assert.equal(graphTimezone('Asia/Shanghai'), 'China Standard Time');
  assert.throws(() => validateConfirmation({}), /Select a company job or postdoc/);
  assert.doesNotThrow(() => validateConfirmation({ association_type: 'job', record_id: 'abc', date: '2026-08-20', time: '14:30', timezone: 'Asia/Shanghai' }));
});

test('Outlook setup rejects unsafe tenant values before writing configuration', async () => {
  await assert.rejects(() => beginConnect({ client_id: '00000000-0000-0000-0000-000000000000', tenant: '../evil' }), /Invalid Microsoft tenant/);
});
