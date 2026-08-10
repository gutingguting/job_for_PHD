const test = require('node:test');
const assert = require('node:assert/strict');
const { suggestionsFromText } = require('../src/resume-parser');

test('resume suggestions are local candidates requiring confirmation', () => {
  const result = suggestionsFromText('Candidate\ncandidate@example.test\n+86 138 0000 0000\nhttps://github.com/example\nhttps://example.test', 'resume.docx');
  assert.equal(result.requires_ocr, false);
  assert.ok(result.candidates.some(item => item.field === 'candidate.email' && item.confirmed === false));
  assert.ok(result.candidates.every(item => item.source === 'resume.docx'));
});

test('short extracted text is flagged as likely scanned PDF', () => {
  assert.equal(suggestionsFromText('image', 'scan.pdf').requires_ocr, true);
});
