import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { advertisingConfig, renderEditorAdFrame } from '../src/server/ads.js';
import { buildLaunchReadiness } from '../src/server/launch-readiness.js';
import { createAnalyticsService } from '../src/server/analytics.js';
import { startServer } from '../src/server/app.js';

const PASSWORD = 'editor-ads-test-password-0123456789';
const SECRET = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const SCRIPT = 'https://cdn.yektanet.com/rg_woebegone/scripts_v3/test/rg.complete.js';

function environment(directory) {
  return {
    NODE_ENV: 'test',
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
    ADS_SCRIPT_URL: SCRIPT,
    ADS_SCRIPT_ID: 'ua-script-editor-test',
    ADS_ALLOWED_ORIGINS: 'https://cdn.yektanet.com,https://*.yektanet.com',
    ADS_EDITOR_ENABLED: 'true',
    ADS_EDITOR_REQUIRE_CROSS_ORIGIN: 'true',
    ADS_EDITOR_FRAME_ORIGIN: 'https://ads.nemodara.ir',
    ADS_EDITOR_TRAFFIC_PERCENT: '100',
    ADS_EDITOR_LOAD_DELAY_MS: '0',
    ADS_SLOT_HOME_TOP: 'pos-home-test',
    ADS_SLOT_EDITOR_RAIL: 'pos-editor-rail-test',
    ADS_SLOT_EDITOR_DOCK: 'pos-editor-dock-test',
    GSC_ENABLED: 'false',
    INDEXNOW_ENABLED: 'false',
  };
}

const basic = () => `Basic ${Buffer.from(`owner:${PASSWORD}`).toString('base64')}`;

function requestWithHost(server, pathname, host, headers = {}) {
  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: '127.0.0.1',
      port: server.port,
      path: pathname,
      method: 'GET',
      headers: { Host: host, Accept: 'text/html', ...headers },
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
    request.end();
  });
}

test('editor advertising is fail-closed unless origin, rollout and placements are valid', () => {
  const unsafe = advertisingConfig({
    NODE_ENV: 'production',
    SITE_URL: 'https://nemodara.ir',
    ADS_ENABLED: 'true',
    ADS_PROVIDER: 'yektanet',
    ADS_SCRIPT_URL: SCRIPT,
    ADS_EDITOR_ENABLED: 'true',
    ADS_EDITOR_REQUIRE_CROSS_ORIGIN: 'true',
    ADS_EDITOR_FRAME_ORIGIN: 'https://nemodara.ir',
    ADS_SLOT_EDITOR_RAIL: 'pos-editor-test',
  });
  assert.equal(unsafe.editor.requested, true);
  assert.equal(unsafe.editor.enabled, false);
  assert.equal(unsafe.slots.editorRail, '');

  const excluded = advertisingConfig({ ...environment('/tmp/unused'), ADS_EDITOR_TRAFFIC_PERCENT: '0' });
  assert.equal(excluded.editor.enabled, false);
  assert.equal(excluded.slots.editorRail, '');

  const safe = advertisingConfig(environment('/tmp/unused'));
  assert.equal(safe.editor.enabled, true);
  assert.equal(safe.editor.frameOrigin, 'https://ads.nemodara.ir');
  assert.equal(safe.editor.trafficPercent, 100);
  assert.equal(safe.editor.loadDelayMs, 0);
  assert.equal(safe.slots.editorRail, 'pos-editor-rail-test');
  assert.equal(safe.slots.editorDock, 'pos-editor-dock-test');
});

test('editor ad frame contains only the placement and publisher bootstrap', () => {
  const html = renderEditorAdFrame('editorRail', environment('/tmp/unused'));
  assert.match(html, /pos-editor-rail-test/);
  assert.match(html, /yektanetAnalyticsObject/);
  assert.match(html, /nemodara-editor-ad/);
  assert.doesNotMatch(html, /CodeMirror|کد Mermaid|textarea id="editor"/);
  assert.equal(renderEditorAdFrame('homeTop', environment('/tmp/unused')), null);
});

test('server rollout decides the initial editor layout before first paint', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'nemodara-editor-rollout-'));
  const env = { ...environment(directory), ADS_EDITOR_TRAFFIC_PERCENT: '25' };
  const server = await startServer({ port: 0, host: '127.0.0.1', environment: env, logger: { error() {} } });
  t.after(async () => {
    await server.close();
    await fs.rm(directory, { recursive: true, force: true });
  });

  const included = await requestWithHost(server, '/editor', 'nemodara.ir', { Cookie: 'nemodara_editor_ads_bucket=7' });
  assert.equal(included.status, 200);
  assert.match(included.body, /data-ad-slot="editorRail"[^>]*data-ad-state="reserved"/);
  assert.doesNotMatch(included.headers['set-cookie']?.join?.('') || '', /nemodara_editor_ads_bucket/);

  const excluded = await requestWithHost(server, '/editor', 'nemodara.ir', { Cookie: 'nemodara_editor_ads_bucket=87' });
  assert.equal(excluded.status, 200);
  assert.match(excluded.body, /data-ad-slot="editorRail"[^>]*hidden/);
  assert.doesNotMatch(excluded.body, /data-ad-slot="editorRail"[^>]*data-ad-state="reserved"/);

  const assigned = await requestWithHost(server, '/editor', 'nemodara.ir');
  const setCookie = Array.isArray(assigned.headers['set-cookie']) ? assigned.headers['set-cookie'][0] : assigned.headers['set-cookie'];
  assert.match(setCookie || '', /nemodara_editor_ads_bucket=\d{1,2}/);
  assert.match(setCookie || '', /HttpOnly/);
  assert.match(setCookie || '', /SameSite=Lax/);
  const bucket = Number(/nemodara_editor_ads_bucket=(\d{1,2})/.exec(setCookie || '')?.[1]);
  const reserved = /data-ad-slot="editorRail"[^>]*data-ad-state="reserved"/.test(assigned.body);
  assert.equal(reserved, bucket < 25);
});

test('editor page reserves responsive ad inventory while keeping publisher scripts outside the parent DOM', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'nemodara-editor-ads-'));
  const server = await startServer({ port: 0, host: '127.0.0.1', environment: environment(directory), logger: { error() {} } });
  t.after(async () => {
    await server.close();
    await fs.rm(directory, { recursive: true, force: true });
  });

  const editor = await fetch(`${server.url}/editor`);
  assert.equal(editor.status, 200);
  const html = await editor.text();
  assert.match(html, /data-ad-slot="editorRail"[^>]*data-ad-state="reserved"/);
  assert.match(html, /data-ad-slot="editorDock"[^>]*data-ad-state="reserved"/);
  assert.match(html, /\/js\/editor-ads\.js/);
  assert.doesNotMatch(html, new RegExp(SCRIPT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

  const csp = editor.headers.get('content-security-policy') || '';
  assert.match(csp, /frame-src[^;]*https:\/\/ads\.nemodara\.ir/);
  assert.doesNotMatch(csp, /script-src[^;]*cdn\.yektanet\.com/);

  const frame = await fetch(`${server.url}/ads/editor-frame?slot=editorRail`);
  assert.equal(frame.status, 200);
  assert.equal(frame.headers.get('x-frame-options'), null);
  assert.match(frame.headers.get('content-security-policy') || '', /frame-ancestors[^;]*https:\/\/nemodara\.ir/);
  assert.match(frame.headers.get('content-security-policy') || '', /script-src[^;]*cdn\.yektanet\.com/);
  assert.match(await frame.text(), /pos-editor-rail-test/);

  const unknown = await fetch(`${server.url}/ads/editor-frame?slot=homeTop`);
  assert.equal(unknown.status, 404);

  const adHostContent = await requestWithHost(server, '/articles', 'ads.nemodara.ir');
  assert.equal(adHostContent.status, 302);
  assert.equal(adHostContent.headers.location, 'https://nemodara.ir/articles');

  const adHostFrame = await requestWithHost(server, '/ads/editor-frame?slot=editorRail', 'ads.nemodara.ir');
  assert.equal(adHostFrame.status, 200);
  assert.match(adHostFrame.body, /pos-editor-rail-test/);

  const readiness = await fetch(`${server.url}/api/admin/launch/readiness`, { headers: { authorization: basic() } });
  assert.equal(readiness.status, 200);
  const report = await readiness.json();
  assert.equal(report.ready, true);
  assert.equal(report.monetizationReady, true);
  assert.ok(report.checks.some((item) => item.key === 'editor-ad-isolation' && item.status === 'pass'));
});

test('viewable editor inventory is stored separately from payable publisher impressions', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'nemodara-editor-viewability-'));
  const env = environment(directory);
  const service = createAnalyticsService({ env, logger: { error() {} } });
  t.after(async () => {
    await service.close();
    await fs.rm(directory, { recursive: true, force: true });
  });

  const req = {
    ip: '203.0.113.20',
    socket: { remoteAddress: '203.0.113.20' },
    headers: { 'user-agent': 'Mozilla/5.0 Chrome/140.0' },
    get(name) { return this.headers[String(name).toLowerCase()]; },
  };
  await service.record({ event: 'page_view', session: 'one', path: '/editor' }, req);
  await service.record({ event: 'ad_slot_view', session: 'one', path: '/editor', slot: 'editorRail' }, req);
  await service.record({ event: 'ad_viewable', session: 'one', path: '/editor', slot: 'editorRail' }, req);
  await service.record({ event: 'ad_script_loaded', session: 'one', path: '/editor', slot: 'editorRail' }, req);

  const today = new Date().toISOString().slice(0, 10);
  const summary = await service.summary({ from: today, to: today });
  const slot = summary.adSlots.find((item) => item.name === 'editorRail');
  assert.deepEqual(slot, { name: 'editorRail', views: 1, viewable: 1, loaded: 1, errors: 0, blocked: 0 });
  assert.equal(summary.totals.impressions, 0, 'first-party viewability must not be reported as publisher impressions');
});

test('launch readiness exposes blockers without leaking secrets', () => {
  const report = buildLaunchReadiness({
    environment: { SITE_URL: 'http://example.test', TRUST_PROXY: 'false' },
    seo: { siteUrl: '', googleVerification: '' },
    analytics: { enabled: false, adminConfigured: false, persistentHashSecret: false, lastError: 'disk denied' },
    advertising: { enabled: false, editor: { requested: true, enabled: false, frameOrigin: null }, slots: {} },
    integrations: {},
  });
  assert.equal(report.ready, false);
  assert.ok(report.counts.blockers >= 4);
  assert.doesNotMatch(JSON.stringify(report), /0123456789abcdef/);
});
