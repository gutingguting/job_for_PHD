const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { PROJECT_ROOT, PROFILE_PATH, RESUME_INDEX_PATH } = require('../src/config');
const { readJSON } = require('../src/storage');

function trackedFiles() {
  return execFileSync('git', ['ls-files', '-c', '-o', '--exclude-standard', '-z'], { cwd: PROJECT_ROOT }).toString('utf8').split('\0').filter(Boolean);
}

const files = trackedFiles();
const forbiddenRoots = ['user-data/', 'my-materials/', '.runtime/', 'node_modules/'];
const violations = files.filter(file => forbiddenRoots.some(root => file.replace(/\\/g, '/').startsWith(root))).map(file => `${file}: private runtime path is tracked`);
const profile = readJSON(PROFILE_PATH, {});
const resumes = readJSON(RESUME_INDEX_PATH, []);
const sensitive = [
  profile?.candidate?.email,
  profile?.candidate?.phone,
  ...(profile?.source_files || []),
  ...resumes.map(item => item.original_name),
].filter(value => typeof value === 'string' && value.length >= 6);

for (const file of files) {
  if (file === 'LICENSE') continue;
  const absolute = path.join(PROJECT_ROOT, file);
  let content;
  try { content = fs.readFileSync(absolute, 'utf8'); } catch { continue; }
  for (const value of sensitive) if (content.includes(value)) violations.push(`${file}: contains a value from the private profile or resume index`);
  if (/[A-Z]:\\Users\\[^\\\r\n]+/i.test(content)) violations.push(`${file}: contains a Windows user-directory path`);
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(content)) violations.push(`${file}: contains a private key`);
}

if (violations.length) {
  console.error('Privacy check failed:\n' + violations.map(value => `- ${value}`).join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Privacy check passed for ${files.length} publishable tracked/untracked files.`);
}
