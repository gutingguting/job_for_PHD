const path = require('path');
const fs = require('fs');
const mammoth = require('mammoth');

function firstMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) return match[1].trim();
  }
  return '';
}

async function extractText(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.docx') {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value || '';
  }
  if (ext === '.pdf') {
    const { PDFParse } = require('pdf-parse');
    const parser = new PDFParse({ data: fs.readFileSync(filePath) });
    try {
      const result = await parser.getText();
      return result.text || '';
    } finally {
      await parser.destroy();
    }
  }
  throw new Error('Unsupported resume type');
}

function suggestionsFromText(text, originalName) {
  const compact = text.replace(/\r/g, '').trim();
  const email = firstMatch(compact, [/([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i]);
  const phone = firstMatch(compact, [/(\+?86[\s-]?)?(1[3-9]\d[\s-]?\d{4}[\s-]?\d{4})/]);
  const urls = [...compact.matchAll(/https?:\/\/[^\s)）]+/g)].map(match => match[0]);
  const github = urls.find(url => /github\.com/i.test(url)) || '';
  const linkedin = urls.find(url => /linkedin\.com/i.test(url)) || '';
  const portfolio = urls.find(url => url !== github && url !== linkedin) || '';
  const graduation = firstMatch(compact, [/(20\d{2})[.年\-/](0?[1-9]|1[0-2])[^\n]{0,12}(?:毕业|预计)/]);

  const candidates = [];
  const add = (field, value, confidence) => {
    if (value) candidates.push({ field, value, confidence, source: originalName, confirmed: false });
  };
  add('candidate.email', email, 'high');
  add('candidate.phone', phone.replace(/\s+/g, ' '), 'medium');
  add('candidate.github_url', github, 'high');
  add('candidate.linkedin_url', linkedin, 'high');
  add('candidate.portfolio_url', portfolio, 'medium');
  add('current_status.expected_graduation', graduation, 'low');
  return { candidates, text_length: compact.length, requires_ocr: compact.length < 80 };
}

async function parseResume(filePath, originalName) {
  const text = await extractText(filePath);
  return suggestionsFromText(text, originalName);
}

module.exports = { extractText, suggestionsFromText, parseResume };
