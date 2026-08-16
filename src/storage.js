const fs = require('fs');
const path = require('path');

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJSON(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

function atomicWrite(filePath, content) {
  ensureDir(path.dirname(filePath));
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, content, 'utf8');
  fs.renameSync(tempPath, filePath);
}

function writeJSON(filePath, value) {
  atomicWrite(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function copyIfMissing(source, destination) {
  if (!source || !fs.existsSync(source) || fs.existsSync(destination)) return false;
  ensureDir(path.dirname(destination));
  fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
  return true;
}

function timestampBackup(filePath, backupRoot, label = 'migration') {
  if (!fs.existsSync(filePath)) return null;
  ensureDir(backupRoot);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const destination = path.join(backupRoot, `${path.basename(filePath)}.${label}.${stamp}.bak`);
  fs.copyFileSync(filePath, destination, fs.constants.COPYFILE_EXCL);
  return destination;
}

function safeFilename(value) {
  const base = path.basename(String(value || 'resume'));
  return base
    .normalize('NFKC')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 120) || 'resume';
}

module.exports = { ensureDir, readJSON, writeJSON, atomicWrite, copyIfMissing, timestampBackup, safeFilename };
