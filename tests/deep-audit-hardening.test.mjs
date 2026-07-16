import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../src/server/app.js';
import { createAnalyticsService } from '../src/server/analytics.js';

const PASSWORD = 'deep-audit-admin-password-0123456789';
const SECRET = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const basic = () => `Basic ${Buffer.from(`owner:${PASSWORD}`).toString('base64')}`;

function environment(directory, overrides = {}) {
  return {
    NODE_ENV: 'production',
    SITE_URL: 'https://nemodara.ir',
    SITE_NAME: 'نمودارا',
    HOST: '127.0.0.1',
    TRUST_PROXY: 'true',
    ANALYTICS_ENABLED: 'true',
    ANALYTICS_DATA_DIR: directory,
    ANALYTICS_TIME_ZONE: 'UTC',
    ANALYTICS_ADMIN_USER: 'owner',
    ANALYTICS_ADMIN_PASSWORD: PASSWORD,
    ANALYTICS_HASH_SECRET: SECRET,
    ADS_ENABLED: 'true',
    ADS_PROVIDER: 'yektanet',
    ADS_SCRIPT_URL: 'https://cdn.yektanet.com/rg_woebegone/scripts_v3/test/rg.complete.js',
    ADS_SCRIPT_ID: 'ua-script-deep-audit',
    ADS_ALLOWED_ORIGINS: 'https://cdn.yektanet.com,https://*.yektanet.com',
    ADS_SLOT_HOME_INLINE: 'pos-home-inline-test',
    ADS_EDITOR_ENABLED: 'true',
    ADS_EDITOR_REQUIRE_CROSS_ORIGIN: 'true',
    ADS_EDITOR_FRAME_ORIGIN: 'https://ads.nemodara.ir',
    ADS_EDITOR_TRAFFIC_PERCENT: '100',
    ADS_EDITOR_LOAD_DELAY_MS: '0',
    ADS_SLOT_EDITOR_RAIL: 'pos-editor-rail-test',
    ADS_SLOT_EDITOR_DOCK: 'pos-editor-dock-test',
    RENDER_GET_ENABLED: 'false',
    GSC_ENABLED: 'false',
    INDEXNOW_ENABLED: 'false',
    ...overrides,
  };
}

function rawRequest(url, { method = 'GET', headers = {}, body = '' } = {}) {
  const parsed = new URL(url);
  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: `${parsed.pathname}${parsed.search}`,
      method,
      headers,
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({
        status: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    request.on('error', reject);
    if (body) request.write(body);
    request.end();
  });
}

test('public content is CDN-cacheable while editor and admin remain private', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'nemodara-cache-audit-'));
  const server = await startServer({ port: 0, host: '127.0.0.1', environment: environment(directory), logger: { error() {} } });
  t.after(async () => {
    await server.close();
    await fs.rm(directory, { recursive: true, force: true });
  });

  const landing = await fetch(`${server.url}/`);
  assert.match(landing.headers.get('cache-control') || '', /s-maxage=300/);
  assert.doesNotMatch(landing.headers.get('cache-control') || '', /no-store/);

  const article = await fetch(`${server.url}/articles/diagram-as-code-for-teams`);
  assert.match(article.headers.get('cache-control') || '', /stale-while-revalidate/);

  const editor = await fetch(`${server.url}/editor`);
  assert.match(editor.headers.get('cache-control') || '', /no-store/);

  const admin = await fetch(`${server.url}/admin/analytics`, { headers: { authorization: basic() } });
  assert.match(admin.headers.get('cache-control') || '', /no-store/);
});

test('admin revenue and Search Console mutations reject cross-site requests', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'nemodara-csrf-audit-'));
  const server = await startServer({ port: 0, host: '127.0.0.1', environment: environment(directory), logger: { error() {} } });
  t.after(async () => {
    await server.close();
    await fs.rm(directory, { recursive: true, force: true });
  });

  const headers = {
    authorization: basic(),
    origin: 'https://attacker.example',
    'sec-fetch-site': 'cross-site',
    'content-type': 'application/json',
  };
  const revenue = await fetch(`${server.url}/api/admin/analytics/revenue`, {
    method: 'POST', headers,
    body: JSON.stringify({ entries: [{ date: '2026-07-16', provider: 'other', slot: 'all', revenueRial: 1 }] }),
  });
  assert.equal(revenue.status, 403);

  const search = await fetch(`${server.url}/api/admin/analytics/search`, {
    method: 'POST', headers,
    body: JSON.stringify({ rows: [{ date: '2026-07-16', query: 'test', clicks: 1, impressions: 2, position: 3 }] }),
  });
  assert.equal(search.status, 403);
});

test('production query-string rendering is disabled while POST rendering remains available', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'nemodara-render-audit-'));
  const server = await startServer({ port: 0, host: '127.0.0.1', environment: environment(directory), logger: { error() {} } });
  t.after(async () => {
    await server.close();
    await fs.rm(directory, { recursive: true, force: true });
  });

  const getResponse = await fetch(`${server.url}/api/render?code=${encodeURIComponent('flowchart TD; A-->B')}&format=svg`);
  assert.equal(getResponse.status, 405);
  const error = await getResponse.json();
  assert.equal(error.code, 'RENDER_GET_DISABLED');

  const postResponse = await fetch(`${server.url}/api/render`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: 'flowchart TD; A-->B', format: 'svg' }),
  });
  assert.equal(postResponse.status, 200);
  assert.match(postResponse.headers.get('content-type') || '', /image\/svg\+xml/);
});

test('production editor frame rejects direct navigation and accepts a genuine same-site iframe request', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'nemodara-frame-audit-'));
  const server = await startServer({ port: 0, host: '127.0.0.1', environment: environment(directory), logger: { error() {} } });
  t.after(async () => {
    await server.close();
    await fs.rm(directory, { recursive: true, force: true });
  });

  const direct = await rawRequest(`${server.url}/ads/editor-frame?slot=editorRail`, {
    headers: { Host: 'ads.nemodara.ir', 'Sec-Fetch-Dest': 'document', 'Sec-Fetch-Site': 'none' },
  });
  assert.equal(direct.status, 403);

  const embedded = await rawRequest(`${server.url}/ads/editor-frame?slot=editorRail`, {
    headers: {
      Host: 'ads.nemodara.ir',
      'Sec-Fetch-Dest': 'iframe',
      'Sec-Fetch-Site': 'same-site',
      Referer: 'https://nemodara.ir/editor',
    },
  });
  assert.equal(embedded.status, 200);
  assert.match(embedded.body, /pos-editor-rail-test/);
  assert.match(embedded.headers['x-robots-tag'] || '', /noindex/);
});

test('rendered and viewable ad inventory remains separate from publisher impressions', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'nemodara-ad-metrics-audit-'));
  const service = createAnalyticsService({ env: environment(directory), logger: { error() {} } });
  t.after(async () => {
    await service.close();
    await fs.rm(directory, { recursive: true, force: true });
  });
  const req = {
    ip: '203.0.113.50',
    socket: { remoteAddress: '203.0.113.50' },
    headers: { 'user-agent': 'Mozilla/5.0 Chrome/140.0' },
    get(name) { return this.headers[String(name).toLowerCase()]; },
  };
  await service.record({ event: 'ad_slot_view', session: 'audit', path: '/editor', slot: 'editorRail' }, req);
  await service.record({ event: 'ad_script_loaded', session: 'audit', path: '/editor', slot: 'editorRail' }, req);
  await service.record({ event: 'ad_rendered', session: 'audit', path: '/editor', slot: 'editorRail' }, req);
  await service.record({ event: 'ad_viewable', session: 'audit', path: '/editor', slot: 'editorRail' }, req);

  const today = new Date().toISOString().slice(0, 10);
  const summary = await service.summary({ from: today, to: today });
  const slot = summary.adSlots.find((item) => item.name === 'editorRail');
  assert.equal(slot.views, 1);
  assert.equal(slot.loaded, 1);
  assert.equal(slot.rendered, 1);
  assert.equal(slot.viewable, 1);
  assert.equal(summary.totals.impressions, 0);
  assert.equal(summary.totals.adRendered, 1);
});

test('browser analytics source measures content viewability and real ad rendering', async () => {
  const analytics = await fs.readFile(new URL('../public/js/analytics.js', import.meta.url), 'utf8');
  const editorAds = await fs.readFile(new URL('../public/js/editor-ads.js', import.meta.url), 'utf8');
  const serverAds = await fs.readFile(new URL('../src/server/ads.js', import.meta.url), 'utf8');
  assert.match(analytics, /intersectionRatio >= 0\.5/);
  assert.match(analytics, /ad_viewable/);
  assert.match(analytics, /ad_rendered/);
  assert.match(editorAds, /'rendered'/);
  assert.match(serverAds, /MutationObserver/);
  assert.match(serverAds, /report\('rendered'\)/);
});
