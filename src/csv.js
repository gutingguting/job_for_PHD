const fs = require('fs');
const { atomicWrite } = require('./storage');

function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i], next = text[i + 1];
    if (inQuotes) {
      if (c === '"' && next === '"') { field += '"'; i += 1; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  while (rows.length && rows.at(-1).length === 1 && rows.at(-1)[0] === '') rows.pop();
  return rows;
}

function stringifyCSV(rows) {
  const field = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
  return `${rows.map(row => row.map(field).join(',')).join('\r\n')}\r\n`;
}

function readCSVRows(filePath) {
  const rows = parseCSV(fs.readFileSync(filePath, 'utf8'));
  return { header: rows[0] || [], dataRows: rows.slice(1) };
}

function writeCSVRows(filePath, header, dataRows) {
  atomicWrite(filePath, stringifyCSV([header, ...dataRows]));
}

function ensureCSVColumns(filePath, columns) {
  const { header, dataRows } = readCSVRows(filePath);
  const missing = columns.filter(column => !header.includes(column));
  if (!missing.length) return false;
  const nextHeader = [...header, ...missing];
  const nextRows = dataRows.map(row => [...row, ...missing.map(() => '')]);
  writeCSVRows(filePath, nextHeader, nextRows);
  return true;
}

module.exports = { parseCSV, stringifyCSV, readCSVRows, writeCSVRows, ensureCSVColumns };
