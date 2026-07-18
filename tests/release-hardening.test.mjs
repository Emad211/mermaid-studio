import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { advertisingConfig } from '../src/server/ads.js';
import { createAnalyticsService, AnalyticsError } from '../src/server/analytics.js';

const SECRET = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

function adEnvironment(directory = '/tmp/unused') {
  return {
    NODE_ENV: 'production',
    SITE_URL: 'https://nemodara.ir',
    ANALYTICS_ENABLED: 'true',
    ANALYTICS_DATA_DIR: directory,
    ANALYTICS_TIME_ZONE: 'UTC',
    ANALYTICS_ADMIN_USER: 'admin',
    ANALYTICS_ADMIN_PASSWORD: 'release-hardening-password-0123456789',
    ANALYTICS_HASH_SECRET: SECRET,
    ADS_ENABLED: 'true',
    ADS_PUBLISHER_VALIDATED: 'true',
    ADS_PROVIDER: 'yektanet',
    ADS_SCRIPT_URL: 'https://cdn.yektanet.com/rg_woebegone/scripts_v3/test/rg.complete.js',
    ADS_SCRIPT_ID: 'ua-script-release-test',
    ADS_SLOT_HOME_INLINE: 'pos-home-inline-test',
    ADS_EDITOR_ENABLED: 'true',
    ADS_EDITOR_REQUIRE_CROSS_ORIGIN: 'true',
    ADS_EDITOR_FRAME_ORIGIN: 'https://ads.nemodara.ir',
    ADS_EDITOR_TRAFFIC_PERCENT: '100',
    ADS_SLOT_EDITOR_RAIL: 'pos-editor-rail-test',
    ADS_SLOT_EDITOR_DOCK: 'pos-editor-dock-test',
  };
}

test('production editor advertising fails closed without a signing secret', () => {
  const unsafe = adEnvironment();
  delete unsafe.ANALYTICS_HASH_SECRET;
  const disabled = advertisingConfig(unsafe);
  assert.equal(disabled.editor.requested, true);
  assert.equal(disabled.editor.tokenReady, false);
  assert.equal(disabled.editor.enabled, false);

  const enabled = advertisingConfig(adEnvironment());
  assert.equal(enabled.editor.enabled, true);
  assert.equal(enabled.editor.tokenReady, true);
  assert.equal(enabled.editor.publisherValidated, true);
  assert.equal(enabled.editor.noFillTimeoutMs, 8000);
});

test('publisher accounting and first-party ad telemetry remain separate', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'nemodara-release-accounting-'));
  const service = createAnalyticsService({ env: adEnvironment(directory), logger: { error() {} } });
  t.after(async () => {
    await service.close();
    await fs.rm(directory, { recursive: true, force: true });
  });

  const req = {
    ip: '203.0.113.10',
    socket: { remoteAddress: '203.0.113.10' },
    headers: { 'user-agent': 'Mozilla/5.0 Chrome/142.0' },
    get(name) { return this.headers[String(name).toLowerCase()]; },
  };
  await service.record({ event: 'page_view', session: 'release-one', path: '/editor' }, req);
  await service.record({ event: 'ad_request', session: 'release-one', path: '/editor', slot: 'editorRail' }, req);
  await service.record({ event: 'ad_slot_view', session: 'release-one', path: '/editor', slot: 'editorRail' }, req);
  await service.record({ event: 'ad_rendered', session: 'release-one', path: '/editor', slot: 'editorRail' }, req);
  await service.record({ event: 'ad_viewable', session: 'release-one', path: '/editor', slot: 'editorRail' }, req);

  const today = new Date().toISOString().slice(0, 10);
  await service.addRevenue({
    date: today,
    provider: 'yektanet',
    slot: 'editorRail',
    requests: 100,
    impressions: 80,
    viewableImpressions: 60,
    clicks: 4,
    revenueRial: 400_000,
  });

  const summary = await service.summary({ from: today, to: today });
  assert.equal(summary.totals.adRequests, 1);
  assert.equal(summary.totals.adRendered, 1);
  assert.equal(summary.totals.adViewable, 1);
  assert.equal(summary.totals.requests, 100);
  assert.equal(summary.totals.impressions, 80);
  assert.equal(summary.totals.viewableImpressions, 60);
  assert.equal(summary.rates.publisherFillRate, 80);
  assert.equal(summary.rates.publisherViewabilityRate, 75);
  assert.equal(summary.rates.internalRenderRate, 100);
  assert.equal(summary.rates.internalViewabilityRate, 100);
});

test('invalid publisher reports cannot create impossible accounting', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'nemodara-release-invalid-'));
  const service = createAnalyticsService({ env: adEnvironment(directory), logger: { error() {} } });
  t.after(async () => {
    await service.close();
    await fs.rm(directory, { recursive: true, force: true });
  });
  const today = new Date().toISOString().slice(0, 10);
  assert.throws(
    () => service.addRevenue({ date: today, provider: 'yektanet', requests: 10, impressions: 11, clicks: 0, revenueRial: 1 }),
    (error) => error instanceof AnalyticsError && error.code === 'INVALID_REVENUE_IMPRESSIONS',
  );
  assert.throws(
    () => service.addRevenue({ date: today, provider: 'yektanet', requests: 10, impressions: 8, viewableImpressions: 9, clicks: 0, revenueRial: 1 }),
    (error) => error instanceof AnalyticsError && error.code === 'INVALID_REVENUE_VIEWABILITY',
  );
});

test('CSV export maps camelCase metrics to stable snake_case columns', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'nemodara-release-csv-'));
  const service = createAnalyticsService({ env: adEnvironment(directory), logger: { error() {} } });
  t.after(async () => {
    await service.close();
    await fs.rm(directory, { recursive: true, force: true });
  });
  const req = {
    ip: '203.0.113.11', socket: { remoteAddress: '203.0.113.11' }, headers: {},
    get(name) { return this.headers[String(name).toLowerCase()]; },
  };
  await service.record({ event: 'page_view', session: 'csv', path: '/' }, req);
  await service.record({ event: 'ad_request', session: 'csv', path: '/', slot: 'homeInline' }, req);
  const today = new Date().toISOString().slice(0, 10);
  const csv = await service.csv({ from: today, to: today });
  const [header, row] = csv.trim().split('\n');
  assert.match(header, /engaged_sessions/);
  assert.match(header, /ad_requests/);
  assert.match(header, /viewable_impressions/);
  assert.ok(row.split(',').length === header.split(',').length);
  assert.match(row, new RegExp(`^${today},`));
});

test('public loaders use explicit postMessage origins and rendered/no-fill states', async () => {
  const [frameSource, editorSource, contentSource] = await Promise.all([
    fs.readFile(new URL('../src/server/ads.js', import.meta.url), 'utf8'),
    fs.readFile(new URL('../public/js/editor-ads.js', import.meta.url), 'utf8'),
    fs.readFile(new URL('../public/js/ads.js', import.meta.url), 'utf8'),
  ]);
  assert.doesNotMatch(frameSource, /postMessage\([^\n]+,\s*['"]\*['"]\)/);
  assert.match(frameSource, /report\('rendered'\)/);
  assert.match(frameSource, /report\('no-fill'\)/);
  assert.match(editorSource, /frameTokens/);
  assert.match(editorSource, /viewport-ineligible/);
  assert.match(contentSource, /notify\('request'/);
  assert.match(contentSource, /notify\('rendered'/);
  assert.match(contentSource, /notify\('no-fill'/);
});
