import { startServer } from '../src/server/app.js';

let passed = 0;
let failed = 0;

function assert(name, condition) {
  if (condition) {
    passed += 1;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } else {
    failed += 1;
    console.error(`  \x1b[31m✗\x1b[0m ${name}`);
  }
}

const server = await startServer({ port: 0 });

try {
  const landing = await fetch(server.url + '/');
  const landingHtml = await landing.text();
  assert('Persian landing page', landing.ok && /lang="fa"/.test(landingHtml) && landingHtml.includes('شروع ساخت نمودار'));
  assert('security headers', landing.headers.get('x-content-type-options') === 'nosniff' && !!landing.headers.get('content-security-policy'));

  const editor = await fetch(server.url + '/editor');
  const editorHtml = await editor.text();
  assert('Persian editor route', editor.ok && /dir="rtl"/.test(editorHtml) && editorHtml.includes('کد Mermaid'));

  const privacy = await fetch(server.url + '/privacy.html');
  const terms = await fetch(server.url + '/terms.html');
  assert('legal pages', privacy.ok && terms.ok);

  const meta = await (await fetch(server.url + '/api/meta')).json();
  assert('public metadata', Array.isArray(meta.diagramTypes) && meta.limits?.maxCodeLength > 0 && meta.allowUnsafeMermaid === false);

  const tooLarge = await fetch(server.url + '/api/render', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: 'A'.repeat(meta.limits.maxCodeLength + 1), format: 'svg' }),
  });
  const tooLargeBody = await tooLarge.json();
  assert('oversized render rejected before Chromium', tooLarge.status === 413 && tooLargeBody.code === 'CODE_TOO_LARGE');

  const badBackground = await fetch(server.url + '/api/render', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: 'flowchart TD; A-->B', format: 'svg', background: 'url(http://127.0.0.1/private)' }),
  });
  const badBackgroundBody = await badBackground.json();
  assert('unsafe CSS background rejected', badBackground.status === 400 && badBackgroundBody.code === 'INVALID_BACKGROUND');
} finally {
  await server.close();
}

console.log(`\n${failed === 0 ? '\x1b[32m' : '\x1b[31m'}${passed} passed, ${failed} failed\x1b[0m`);
process.exit(failed ? 1 : 0);
