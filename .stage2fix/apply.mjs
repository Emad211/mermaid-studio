import fs from 'node:fs';

const filename = 'tests/security.test.mjs';
const source = fs.readFileSync(filename, 'utf8');
const before = `  const cookie = Array.isArray(response.headers['set-cookie']) ? response.headers['set-cookie'][0] : response.headers['set-cookie'];
  assert.match(cookie || '', /__Host-nemodara_editor_ads_bucket=\\d{1,2}/);
`;
const after = `  const cookies = Array.isArray(response.headers['set-cookie'])
    ? response.headers['set-cookie']
    : [response.headers['set-cookie']].filter(Boolean);
  const cookie = cookies.find((value) => String(value).startsWith('__Host-nemodara_editor_ads_bucket='));
  assert.ok(cookie, 'Expected the secure editor rollout cookie to be present.');
  assert.match(cookie, /__Host-nemodara_editor_ads_bucket=\\d{1,2}/);
`;
if (!source.includes(before)) throw new Error('Secure cookie test anchor not found exactly once.');
if (source.indexOf(before) !== source.lastIndexOf(before)) throw new Error('Secure cookie test anchor is ambiguous.');
fs.writeFileSync(filename, source.replace(before, after));
