const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ensureCSVColumns, readCSVRows } = require('../src/csv');

test('CSV migration appends postdoc policy columns without shifting existing data', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'job-for-phd-csv-'));
  const file = path.join(dir, 'postdocs.csv');
  try {
    fs.writeFileSync(file, '"id","institute"\r\n"1","PSI"\r\n', 'utf8');
    assert.equal(ensureCSVColumns(file, ['matched_research_area', 'matched_target_institution']), true);
    assert.equal(ensureCSVColumns(file, ['matched_research_area', 'matched_target_institution']), false);
    const { header, dataRows } = readCSVRows(file);
    assert.deepEqual(header, ['id', 'institute', 'matched_research_area', 'matched_target_institution']);
    assert.deepEqual(dataRows, [['1', 'PSI', '', '']]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
