import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../src/server/app.js';
import { createAdminStore } from '../src/server/admin-store.js';
import { buildGrowthReport } from '../src/server/growth-insights.js';
import { indexNowConfig } from '../src/server/indexnow.js';
import { searchConsoleConfig } from '../src/server/search-console.js';

const basic = (user, password) => `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;

function environment(directory) {
  return {
    NODE_ENV: 'test',
    SITE_URL: 'https://diagram.example.com',
    SITE_NAME: 'Mermaid Studio',
    SEO_LAST_MODIFIED: '2026-07-13',
    ANALYTICS_ENABLED: 'true',
    ANALYTICS_RESPECT_DNT: 'true',
    ANALYTICS_DATA_DIR: directory,
    ANALYTICS_TIME_ZONE: 'UTC',
    ANALYTICS_ADMIN_USER: 'owner',
    ANALYTICS_ADMIN_PASSWORD: 'a-very-long-random-password-12345',
    ANALYTICS_HASH_SECRET: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    ANALYTICS_ESTIMATED_RPM_RIAL: '250000',
    ADS_ENABLED: 'false',
    GSC_ENABLED: 'false',
    INDEXNOW_ENABLED: 'false',
  };
}

async function json(response) {
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || `${response.status}`);
  return body;
}

async function postEvent(base, event) {
  const response = await fetch(`${base}/api/analytics/event`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'Mozilla/5.0 Chrome/140.0 Windows NT 10.0' },
    body: JSON.stringify(event),
  });
  assert.equal(response.status, 204);
}

test('admin control center provides protected analytics, goals, annotations and SEO audit', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mstudio-admin-'));
  const env = environment(directory);
  const authorization = basic(env.ANALYTICS_ADMIN_USER, env.ANALYTICS_ADMIN_PASSWORD);
  const server = await startServer({ port: 0, host: '127.0.0.1', environment: env, logger: { error() {} } });
  t.after(async () => {
    await server.close();
    await fs.rm(directory, { recursive: true, force: true });
  });

  const unauthorized = await fetch(`${server.url}/admin/analytics`, { redirect: 'manual' });
  assert.equal(unauthorized.status, 401);

  const dashboard = await fetch(`${server.url}/admin/analytics`, { headers: { authorization } });
  assert.equal(dashboard.status, 200);
  const dashboardHtml = await dashboard.text();
  assert.match(dashboardHtml, /مرکز کنترل درآمد، محصول و SEO/);
  assert.match(dashboard.headers.get('x-robots-tag') || '', /noindex/);

  const today = new Date().toISOString().slice(0, 10);
  await postEvent(server.url, { event: 'page_view', session: 'one', path: '/', referrer: 'google.com' });
  await postEvent(server.url, { event: 'engagement', session: 'one', path: '/', seconds: 45 });
  await postEvent(server.url, { event: 'editor_open', session: 'one', path: '/' });
  await postEvent(server.url, { event: 'render_success', session: 'one', path: '/editor' });
  await postEvent(server.url, { event: 'export', session: 'one', path: '/editor', format: 'svg' });
  await postEvent(server.url, { event: 'share', session: 'one', path: '/editor' });
  await postEvent(server.url, { event: 'page_view', session: 'two', path: '/learn/flowchart-mermaid', referrer: 'google.com' });
  await postEvent(server.url, { event: 'editor_open', session: 'two', path: '/learn/flowchart-mermaid' });

  const revenue = await fetch(`${server.url}/api/admin/analytics/revenue`, {
    method: 'POST',
    headers: { authorization, 'content-type': 'application/json' },
    body: JSON.stringify({ entries: [{ id: 'admin-test', date: today, provider: 'yektanet', slot: 'learnInline', impressions: 1000, clicks: 20, revenueRial: 500000 }] }),
  });
  assert.equal(revenue.status, 201);

  const search = await fetch(`${server.url}/api/admin/analytics/search`, {
    method: 'POST',
    headers: { authorization, 'content-type': 'application/json' },
    body: JSON.stringify({ rows: [
      { date: today, query: 'آموزش mermaid', page: 'https://diagram.example.com/learn/flowchart-mermaid', clicks: 2, impressions: 500, position: 4.2 },
      { date: today, query: 'رسم فلوچارت با کد', page: 'https://diagram.example.com/learn/flowchart-mermaid', clicks: 1, impressions: 300, position: 12.1 },
    ] }),
  });
  assert.equal(search.status, 201);

  const goalResponse = await fetch(`${server.url}/api/admin/goals`, {
    method: 'PUT',
    headers: { authorization, 'content-type': 'application/json' },
    body: JSON.stringify({ monthlyRevenueRial: 2000000, monthlyPageviews: 10000, monthlyOrganicClicks: 500, editorOpenRate: 20, pageRpmRial: 300000, lcpMs: 2300, inpMs: 180, cls: 0.08 }),
  });
  const goals = await json(goalResponse);
  assert.equal(goals.monthlyRevenueRial, 2000000);

  const annotationResponse = await fetch(`${server.url}/api/admin/annotations`, {
    method: 'POST',
    headers: { authorization, 'content-type': 'application/json' },
    body: JSON.stringify({ date: today, type: 'release', title: 'انتشار پنل رشد', note: 'نسخه آزمایشی' }),
  });
  const annotation = await json(annotationResponse);
  assert.equal(annotation.type, 'release');

  const overview = await json(await fetch(`${server.url}/api/admin/growth/overview?from=${today}&to=${today}`, { headers: { authorization } }));
  assert.equal(overview.current.totals.pageviews, 2);
  assert.equal(overview.current.totals.actualRevenueRial, 500000);
  assert.ok(Array.isArray(overview.funnel) && overview.funnel.length >= 5);
  assert.equal(overview.funnel.find((step) => step.key === 'editor').value, 2);
  assert.equal(overview.contentMatrix.find((row) => row.path === '/learn/flowchart-mermaid').editorOpens, 1);
  assert.ok(overview.opportunities.ctr.length >= 1);
  assert.equal(overview.annotations[0].title, 'انتشار پنل رشد');
  assert.ok(overview.goals.some((goal) => goal.key === 'monthlyRevenueRial' && goal.configured));

  const integrations = await json(await fetch(`${server.url}/api/admin/integrations/status`, { headers: { authorization } }));
  assert.equal(integrations.searchConsole.configured, false);
  assert.equal(integrations.indexNow.configured, false);

  const gsc = await fetch(`${server.url}/api/admin/seo/search-console/sync`, {
    method: 'POST', headers: { authorization, 'content-type': 'application/json' }, body: JSON.stringify({ from: today, to: today }),
  });
  assert.equal(gsc.status, 503);

  const indexNow = await fetch(`${server.url}/api/admin/seo/indexnow`, {
    method: 'POST', headers: { authorization, 'content-type': 'application/json' }, body: '{}',
  });
  assert.equal(indexNow.status, 503);

  const auditResponse = await fetch(`${server.url}/api/admin/seo/audit/run`, {
    method: 'POST', headers: { authorization, 'content-type': 'application/json' }, body: '{}',
  });
  const audit = await json(auditResponse);
  assert.ok(audit.score >= 70, `unexpected SEO score: ${audit.score}`);
  assert.ok(audit.pages.some((page) => page.route === '/learn/flowchart-mermaid'));
  assert.ok(audit.globalChecks.some((item) => item.key === 'sitemap-file'));

  const history = await json(await fetch(`${server.url}/api/admin/seo/audits`, { headers: { authorization } }));
  assert.equal(history.entries.length, 1);
  assert.equal(history.entries[0].score, audit.score);

  const crossSite = await fetch(`${server.url}/api/admin/goals`, {
    method: 'PUT',
    headers: { authorization, origin: 'https://attacker.example', 'content-type': 'application/json' },
    body: '{}',
  });
  assert.equal(crossSite.status, 403);

  const deletion = await fetch(`${server.url}/api/admin/annotations/${encodeURIComponent(annotation.id)}`, { method: 'DELETE', headers: { authorization } });
  assert.equal(deletion.status, 204);
});

test('admin store persists goals, annotations and audit history atomically', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mstudio-admin-store-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const store = createAdminStore({ dataDir: directory, logger: { error() {} } });
  await store.saveGoals({ monthlyPageviews: 8000, editorOpenRate: 15 });
  const annotation = await store.addAnnotation({ date: '2026-07-13', title: 'تغییر عنوان', type: 'content' });
  await store.saveAudit({ score: 92, grade: 'A', runAt: new Date().toISOString(), durationMs: 120, counts: { pages: 3 }, pages: [], issues: [], globalChecks: [] });

  const restored = createAdminStore({ dataDir: directory, logger: { error() {} } });
  assert.equal((await restored.getGoals()).monthlyPageviews, 8000);
  assert.equal((await restored.listAnnotations())[0].id, annotation.id);
  assert.equal((await restored.auditHistory(1))[0].score, 92);
});

test('growth insight engine generates comparison, funnel and actionable search opportunities', () => {
  const current = {
    from: '2026-07-01', to: '2026-07-07',
    totals: { pageviews: 1000, sessions: 500, visitors: 450, actualRevenueRial: 500000, searchClicks: 25, searchImpressions: 2000, exports: 100, editorSessions: 120, renderSessions: 90, exportSessions: 65, shareSessions: 10 },
    rates: { pageRpmRial: 500000, editorOpenRate: 24, bounceRate: 40, renderSuccessRate: 98, fillRate: 70 },
    forecast: { next30DaysRial: 2200000 }, events: {}, adSlots: [], vitals: {}, topPages: [{ name: '/learn', pageviews: 500, sessions: 300, engagementSeconds: 18000, editorOpens: 50 }],
    search: { topQueries: [{ name: 'آموزش mermaid', clicks: 5, impressions: 1000, ctr: 0.5, position: 3 }], topPages: [{ name: 'https://example.com/learn', clicks: 5, impressions: 1000, ctr: 0.5, position: 3 }] },
  };
  const previous = { from: '2026-06-24', to: '2026-06-30', totals: { pageviews: 800, sessions: 430, visitors: 400, actualRevenueRial: 420000, searchClicks: 20, searchImpressions: 1700, exports: 80 }, rates: { pageRpmRial: 525000, editorOpenRate: 20, bounceRate: 45 } };
  const report = buildGrowthReport({ current, previous, goals: { monthlyPageviews: 2000 }, annotations: [], configuration: { siteUrl: 'https://example.com', googleVerification: 'ok' } });
  assert.equal(Math.round(report.comparison.pageviews.delta), 25);
  assert.equal(report.funnel.find((step) => step.key === 'export').value, 65);
  assert.ok(report.opportunities.ctr[0].missingClicks > 0);
  assert.equal(report.contentMatrix[0].editorOpenRate, 50 / 300 * 100);
});

test('optional integration configs remain fail-closed without credentials or keys', () => {
  assert.equal(searchConsoleConfig({ GSC_ENABLED: 'true', SITE_URL: 'https://example.com' }).enabled, false);
  assert.equal(indexNowConfig({ INDEXNOW_ENABLED: 'true', SITE_URL: 'https://example.com', INDEXNOW_KEY: 'short' }).enabled, false);
});
