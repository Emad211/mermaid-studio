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

const adEnvironmentKeys = [
  'ADS_ENABLED',
  'ADS_PROVIDER',
  'ADS_SCRIPT_URL',
  'ADS_SCRIPT_ID',
  'ADS_ALLOWED_ORIGINS',
  'ADS_SLOT_HOME_TOP',
  'ADS_SLOT_HOME_INLINE',
  'ADS_SLOT_TEMPLATES_TOP',
  'ADS_SLOT_TEMPLATES_INLINE',
  'ADS_SLOT_LEARN_TOP',
  'ADS_SLOT_LEARN_INLINE',
  'ADS_EDITOR_ENABLED',
  'ADS_EDITOR_REQUIRE_CROSS_ORIGIN',
  'ADS_EDITOR_FRAME_ORIGIN',
  'ADS_SLOT_EDITOR_RAIL',
  'ADS_SLOT_EDITOR_DOCK',
];
const previousAdEnvironment = Object.fromEntries(adEnvironmentKeys.map((key) => [key, process.env[key]]));
adEnvironmentKeys.forEach((key) => delete process.env[key]);

const server = await startServer({ port: 0 });

try {
  const landing = await fetch(server.url + '/');
  const landingHtml = await landing.text();
  assert('Nemodara Persian landing page', landing.ok && /lang="fa"/.test(landingHtml) && landingHtml.includes('نمودار خوب') && landingHtml.includes('نمودارا'));
  assert('landing has labelled ad surfaces', landingHtml.includes('data-ad-slot="homeTop"') && landingHtml.includes('data-ad-slot="homeInline"'));
  assert('security headers', landing.headers.get('x-content-type-options') === 'nosniff' && !!landing.headers.get('content-security-policy'));

  const editor = await fetch(server.url + '/editor');
  const editorHtml = await editor.text();
  assert('Persian editor route', editor.ok && /dir="rtl"/.test(editorHtml) && editorHtml.includes('کد Mermaid'));
  assert(
    'editor ad inventory is present but inert by default',
    editorHtml.includes('data-ad-slot="editorRail"')
      && editorHtml.includes('data-ad-slot="editorDock"')
      && editorHtml.includes('/js/editor-ads.js')
      && !editorHtml.includes('/js/ads.js')
      && /data-ad-slot="editorRail"[^>]*hidden/.test(editorHtml)
      && !editorHtml.includes('data-ad-state="reserved"'),
  );

  const templates = await fetch(server.url + '/templates');
  const templatesHtml = await templates.text();
  assert('template library uses Nemodara and has ad surfaces', templates.ok && templatesHtml.includes('نمودارا') && templatesHtml.includes('data-ad-slot="templatesTop"'));

  const learn = await fetch(server.url + '/learn');
  const learnHtml = await learn.text();
  assert('Nemodara Persian learning hub', learn.ok && learnHtml.includes('Mermaid را برای حل مسئله'));
  assert('learning hub has deep article links', learnHtml.includes('/learn/flowchart-mermaid') && learnHtml.includes('/learn/mermaid-errors'));
  assert('learning hub has ad surfaces', learnHtml.includes('data-ad-slot="learnInline"'));

  const privacy = await fetch(server.url + '/privacy.html');
  const privacyHtml = await privacy.text();
  const terms = await fetch(server.url + '/terms.html');
  assert('legal pages', privacy.ok && terms.ok && privacyHtml.includes('id="advertising"'));

  const meta = await (await fetch(server.url + '/api/meta')).json();
  assert('public metadata', Array.isArray(meta.diagramTypes) && meta.product?.safeMode === true && meta.businessModel === 'advertising');
  assert('legacy sponsor metadata removed', !Object.prototype.hasOwnProperty.call(meta, 'sponsor'));

  const adsResponse = await fetch(server.url + '/api/ads');
  const ads = await adsResponse.json();
  assert(
    'ads are opt-in and disabled by default',
    adsResponse.ok && ads.enabled === false && ads.editor?.enabled === false && ads.slots?.homeTop === '' && ads.slots?.editorRail === '',
  );

  const analyticsConfig = await (await fetch(server.url + '/api/analytics/config')).json();
  assert('first-party analytics config is explicit', typeof analyticsConfig.enabled === 'boolean' && analyticsConfig.respectDnt === true);

  const tooLarge = await fetch(server.url + '/api/render', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: 'A'.repeat(100_001), format: 'svg' }),
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
  for (const key of adEnvironmentKeys) {
    const value = previousAdEnvironment[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

console.log(`\n${failed === 0 ? '\x1b[32m' : '\x1b[31m'}${passed} passed, ${failed} failed\x1b[0m`);
process.exit(failed ? 1 : 0);
