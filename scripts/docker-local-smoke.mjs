import assert from 'node:assert/strict';

const full = process.argv.includes('--full');
const port = Number(process.env.PORT || 4321);
const base = `http://127.0.0.1:${port}`;
const adminUser = process.env.ANALYTICS_ADMIN_USER || 'admin';
const adminPassword = process.env.ANALYTICS_ADMIN_PASSWORD || '';
const authorization = `Basic ${Buffer.from(`${adminUser}:${adminPassword}`).toString('base64')}`;

function log(message) {
  process.stdout.write(`✓ ${message}\n`);
}

async function fetchWithTimeout(pathname, options = {}, timeoutMs = 45_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();
  try {
    return await fetch(`${base}${pathname}`, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function expectStatus(pathname, expected = 200, options = {}, timeoutMs = 45_000) {
  const response = await fetchWithTimeout(pathname, options, timeoutMs);
  assert.equal(response.status, expected, `${pathname} returned ${response.status}, expected ${expected}`);
  return response;
}

assert.ok(adminPassword.length >= 12, 'ANALYTICS_ADMIN_PASSWORD must be configured.');

const healthResponse = await expectStatus('/api/health');
const health = await healthResponse.json();
assert.equal(health.ok, true);
assert.equal(typeof health.version, 'string');
assert.deepEqual(Object.keys(health).sort(), ['ok', 'version']);
log(`public health endpoint is minimal and ready (version ${health.version || 'unknown'})`);

await expectStatus('/api/admin/health', 401, { redirect: 'manual' });
const operationalHealthResponse = await expectStatus('/api/admin/health', 200, {
  headers: { Authorization: authorization },
});
const operationalHealth = await operationalHealthResponse.json();
assert.equal(operationalHealth.ok, true);
assert.equal(operationalHealth.analytics?.adminConfigured, true);
assert.equal(operationalHealth.analytics?.persistentHashSecret, true);
log('protected operational health exposes analytics readiness to administrators');

for (const route of ['/', '/editor', '/templates', '/learn', '/articles', '/privacy', '/terms']) {
  const response = await expectStatus(route);
  assert.match(response.headers.get('content-type') || '', /text\/html/);
  log(`${route} returns HTML`);
}

const unauthorized = await expectStatus('/admin/analytics', 401, { redirect: 'manual' });
assert.match(unauthorized.headers.get('www-authenticate') || '', /Basic/i);
log('admin panel rejects unauthenticated access');

const adminResponse = await expectStatus('/admin/analytics', 200, {
  headers: { Authorization: authorization },
});
assert.match(await adminResponse.text(), /مرکز کنترل درآمد، محصول و SEO/);
log('admin panel accepts generated local credentials');

await expectStatus('/admin/content', 401, { redirect: 'manual' });
const contentAdminResponse = await expectStatus('/admin/content', 200, {
  headers: { Authorization: authorization },
});
assert.match(await contentAdminResponse.text(), /اتاق عملیات محتوا/);
log('content operations panel is protected and operational');

const ads = await (await expectStatus('/api/ads')).json();
assert.equal(ads.enabled, false);
log('third-party advertising is disabled in the local stack');

const analyticsEvent = await expectStatus('/api/analytics/event', 204, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'User-Agent': 'Nemodara Local Smoke Test' },
  body: JSON.stringify({ event: 'page_view', session: `local-smoke-${Date.now()}`, path: '/', referrer: 'direct' }),
});
assert.equal(await analyticsEvent.text(), '');
log('first-party analytics accepts a local event');

const overview = await (await expectStatus('/api/admin/growth/overview?days=1', 200, {
  headers: { Authorization: authorization },
})).json();
assert.equal(overview.current?.enabled, true);
assert.ok(Number(overview.current?.totals?.pageviews) >= 1);
assert.ok(Array.isArray(overview.funnel));
log('growth and revenue overview API is operational');

const sitemapResponse = await expectStatus('/sitemap.xml');
const sitemap = await sitemapResponse.text();
assert.match(sitemap, /<urlset\b/);
assert.match(sitemap, /\/learn\/flowchart-mermaid/);
assert.match(sitemap, /\/articles\/diagram-as-code-for-teams/);
log('dynamic sitemap contains the Persian learning and magazine clusters');

const svgResponse = await expectStatus('/api/render', 200, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ code: 'flowchart TD; A[Local Docker]-->B[Ready]', format: 'svg' }),
});
assert.match(svgResponse.headers.get('content-type') || '', /image\/svg\+xml/);
assert.match(await svgResponse.text(), /<svg\b/);
log('server-side SVG rendering works');

if (full) {
  const pdfResponse = await expectStatus('/api/render', 200, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: 'sequenceDiagram\n  User->>Studio: Local Docker test\n  Studio-->>User: PDF ready', format: 'pdf' }),
  }, 90_000);
  const pdf = Buffer.from(await pdfResponse.arrayBuffer());
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  log('Chromium PDF rendering works');

  const auditResponse = await fetchWithTimeout('/api/admin/seo/audit/run', {
    method: 'POST',
    headers: { Authorization: authorization, 'Content-Type': 'application/json' },
    body: '{}',
  }, 120_000);
  assert.equal(auditResponse.status, 201, `SEO audit returned ${auditResponse.status}`);
  const audit = await auditResponse.json();
  assert.ok(Number.isFinite(Number(audit.score)));
  assert.ok(Array.isArray(audit.pages) && audit.pages.length >= 8);
  assert.ok(Array.isArray(audit.globalChecks));
  log(`live technical SEO audit works (score ${audit.score}/100)`);
}

process.stdout.write(`\nLocal Docker ${full ? 'full' : 'quick'} test completed successfully.\n`);
