import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createAnalyticsService } from '../src/server/analytics.js';
import { startServer } from '../src/server/app.js';

function request({ ip = '203.0.113.15', userAgent = 'Analytics Test Browser', headers = {} } = {}) {
  const normalized = Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
  return {
    ip,
    socket: { remoteAddress: ip },
    headers: { 'user-agent': userAgent, ...normalized },
    get(name) {
      return this.headers[String(name).toLowerCase()];
    },
  };
}

function environment(directory) {
  return {
    NODE_ENV: 'test',
    ANALYTICS_ENABLED: 'true',
    ANALYTICS_RESPECT_DNT: 'true',
    ANALYTICS_DATA_DIR: directory,
    ANALYTICS_TIME_ZONE: 'UTC',
    ANALYTICS_ADMIN_USER: 'owner',
    ANALYTICS_ADMIN_PASSWORD: 'a-very-long-random-password-12345',
    ANALYTICS_HASH_SECRET: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    ANALYTICS_ESTIMATED_RPM_RIAL: '250000',
    SITE_URL: 'https://diagram.example.com',
  };
}

const basic = (user, password) => `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;

test('analytics aggregates product, revenue, SEO and Web Vitals without raw personal data', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mstudio-analytics-'));
  const service = createAnalyticsService({ env: environment(directory), logger: { error() {} } });
  t.after(async () => {
    await service.close();
    await fs.rm(directory, { recursive: true, force: true });
  });

  const req1 = request({ ip: '203.0.113.15', userAgent: 'Mozilla/5.0 Chrome/140.0 Windows NT 10.0' });
  const req2 = request({ ip: '198.51.100.44', userAgent: 'Mozilla/5.0 Mobile Safari/605.1 iPhone' });

  await service.record({ event: 'page_view', session: 'session-one', path: '/', referrer: 'google.com' }, req1);
  await service.record({ event: 'engagement', session: 'session-one', path: '/', seconds: 46 }, req1);
  await service.record({ event: 'editor_open', session: 'session-one', path: '/' }, req1);
  await service.record({ event: 'render_success', session: 'session-one', path: '/editor' }, req1);
  await service.record({ event: 'export', session: 'session-one', path: '/editor', format: 'svg' }, req1);
  await service.record({ event: 'ad_slot_view', session: 'session-one', path: '/', slot: 'homeInline' }, req1);
  await service.record({ event: 'web_vitals', session: 'session-one', path: '/', metrics: { lcp: 1800, inp: 90, cls: 0.04, ttfb: 310, fcp: 900 } }, req1);
  await service.record({ event: 'page_view', session: 'session-two', path: '/learn', referrer: '' }, req2);
  await service.record({ event: 'render_error', session: 'session-two', path: '/editor' }, req2);

  const today = new Date().toISOString().slice(0, 10);
  await service.addRevenue({
    id: 'revenue-test', date: today, provider: 'yektanet', slot: 'homeInline',
    impressions: 1000, clicks: 20, revenueRial: 500000, note: 'test',
  });
  const searchRows = [
    { date: today, query: 'آموزش mermaid', page: 'https://diagram.example.com/learn', clicks: 8, impressions: 100, position: 3.5 },
  ];
  await service.importSearch(searchRows);
  await service.importSearch(searchRows);

  const summary = await service.summary({ from: today, to: today });
  assert.equal(summary.totals.pageviews, 2);
  assert.equal(summary.totals.sessions, 2);
  assert.equal(summary.totals.visitors, 2);
  assert.equal(summary.totals.exports, 1);
  assert.equal(summary.totals.actualRevenueRial, 500000);
  assert.equal(summary.totals.impressions, 1000);
  assert.equal(summary.totals.clicks, 20);
  assert.equal(summary.rates.pageRpmRial, 250000000);
  assert.equal(summary.rates.ecpmRial, 500000);
  assert.equal(summary.rates.ctr, 2);
  assert.equal(summary.search.topQueries[0].clicks, 8);
  assert.equal(summary.search.topQueries[0].impressions, 100);
  assert.equal(summary.vitals.lcp.p75, 1800);
  assert.equal(summary.exportsByFormat.svg, 1);
  assert.equal(summary.adSlots[0].name, 'homeInline');

  await service.flush();
  const files = await fs.readdir(directory);
  const content = (await Promise.all(files.map((name) => fs.readFile(path.join(directory, name), 'utf8')))).join('\n');
  assert.doesNotMatch(content, /203\.0\.113\.15|198\.51\.100\.44/);
  assert.doesNotMatch(content, /Analytics Test Browser|password/i);
  assert.doesNotMatch(content, /flowchart|sequenceDiagram/);
});

test('analytics operation queue recovers after a rejected admin mutation', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mstudio-analytics-recovery-'));
  const service = createAnalyticsService({ env: environment(directory), logger: { error() {} } });
  t.after(async () => {
    await service.close();
    await fs.rm(directory, { recursive: true, force: true });
  });

  await assert.rejects(service.deleteRevenue('missing-entry'), /not found/i);
  const today = new Date().toISOString().slice(0, 10);
  await service.addRevenue({
    id: 'after-error', date: today, provider: 'tapsell', slot: 'learnInline',
    impressions: 200, clicks: 3, revenueRial: 90000,
  });
  const summary = await service.summary({ from: today, to: today });
  assert.equal(summary.totals.actualRevenueRial, 90000);
});

test('analytics HTTP routes are protected and respect DNT', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mstudio-analytics-http-'));
  const env = environment(directory);
  const server = await startServer({ port: 0, host: '127.0.0.1', environment: env, logger: { error() {} } });
  t.after(async () => {
    await server.close();
    await fs.rm(directory, { recursive: true, force: true });
  });

  const config = await (await fetch(`${server.url}/api/analytics/config`)).json();
  assert.equal(config.enabled, true);
  assert.equal(config.respectDnt, true);

  const tracked = await fetch(`${server.url}/api/analytics/event`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ event: 'page_view', session: 'http-session', path: '/' }),
  });
  assert.equal(tracked.status, 204);

  const optedOut = await fetch(`${server.url}/api/analytics/event`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', dnt: '1' },
    body: JSON.stringify({ event: 'page_view', session: 'do-not-track', path: '/' }),
  });
  assert.equal(optedOut.status, 204);

  const unauthorized = await fetch(`${server.url}/admin/analytics`, { redirect: 'manual' });
  assert.equal(unauthorized.status, 401);
  assert.match(unauthorized.headers.get('www-authenticate') || '', /Basic/);

  const authorization = basic(env.ANALYTICS_ADMIN_USER, env.ANALYTICS_ADMIN_PASSWORD);
  const dashboard = await fetch(`${server.url}/admin/analytics`, { headers: { authorization } });
  assert.equal(dashboard.status, 200);
  assert.match(await dashboard.text(), /مرکز کنترل درآمد، محصول و SEO/);
  assert.match(dashboard.headers.get('x-robots-tag') || '', /noindex/);

  const summaryResponse = await fetch(`${server.url}/api/admin/analytics/summary`, { headers: { authorization } });
  assert.equal(summaryResponse.status, 200);
  const summary = await summaryResponse.json();
  assert.equal(summary.totals.pageviews, 1);
});
