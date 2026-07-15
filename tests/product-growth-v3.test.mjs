import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../src/server/app.js';
import { closeBrowser } from '../src/core/renderer.js';
import { EDITORIAL_ARTICLES } from '../src/server/article-content.js';

const basic = (user, password) => `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;

function environment(directory) {
  return {
    NODE_ENV: 'test',
    SITE_URL: 'https://nemodara.ir',
    SITE_NAME: 'نمودارا',
    SEO_LAST_MODIFIED: '2026-07-15',
    SEO_AUTHOR_NAME: 'تحریریهٔ نمودارا',
    ANALYTICS_ENABLED: 'true',
    ANALYTICS_DATA_DIR: directory,
    ANALYTICS_TIME_ZONE: 'UTC',
    ANALYTICS_ADMIN_USER: 'owner',
    ANALYTICS_ADMIN_PASSWORD: 'a-long-random-content-admin-password',
    ANALYTICS_HASH_SECRET: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    ADS_ENABLED: 'true',
    ADS_PROVIDER: 'yektanet',
    ADS_SCRIPT_URL: 'https://cdn.yektanet.com/rg_woebegone/scripts_v3/test/rg.complete.js',
    ADS_SCRIPT_ID: 'ua-script-test-publisher',
    ADS_ALLOWED_ORIGINS: 'https://cdn.yektanet.com,https://*.yektanet.com',
    ADS_SLOT_ARTICLES_TOP: 'pos-article-display-card-1001',
    ADS_SLOT_ARTICLE_MID: 'pos-article-display-card-1002',
    ADS_SLOT_ARTICLE_END: 'pos-article-display-card-1003',
    ADS_SLOT_LEARN_FEED: 'pos-article-display-card-1004',
    PUPPETEER_NO_SANDBOX: 'true',
  };
}

async function body(response) {
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || `${response.status}`);
  return value;
}

async function event(base, payload) {
  const response = await fetch(`${base}/api/analytics/event`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'Mozilla/5.0 Chrome/140.0' },
    body: JSON.stringify(payload),
  });
  assert.equal(response.status, 204);
}

test('Nemodara magazine, editorial trust, ad surfaces and content operations work together', { timeout: 180_000 }, async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'nemodara-growth-v3-'));
  const env = environment(directory);
  const authorization = basic(env.ANALYTICS_ADMIN_USER, env.ANALYTICS_ADMIN_PASSWORD);
  const server = await startServer({ port: 0, host: '127.0.0.1', environment: env, logger: { error() {} } });
  t.after(async () => {
    await closeBrowser();
    await server.close();
    await fs.rm(directory, { recursive: true, force: true });
  });

  const articles = await fetch(`${server.url}/articles`);
  const articlesHtml = await articles.text();
  assert.equal(articles.status, 200);
  assert.match(articlesHtml, /مجلهٔ نمودارا/);
  assert.match(articlesHtml, /diagram-as-code-for-teams/);
  assert.match(articlesHtml, /data-ad-slot="articlesTop"/);
  assert.doesNotMatch(articlesHtml, /data-ad-slot="articlesTop"[^>]*\shidden/);
  assert.match(articlesHtml, /--ad-min-desktop/);
  assert.match(articles.headers.get('link') || '', /https:\/\/nemodara\.ir\/articles/);

  for (const article of EDITORIAL_ARTICLES) {
    const response = await fetch(`${server.url}/articles/${article.slug}`);
    const html = await response.text();
    assert.equal(response.status, 200, article.slug);
    assert.match(html, new RegExp(article.author.name));
    assert.match(html, /روش نوشتن و بازبینی محتوا|این مقاله چطور آماده شد/);
    assert.match(html, /data-ad-slot="articleMid"/);
  }

  const about = await (await fetch(`${server.url}/about`)).text();
  const policy = await (await fetch(`${server.url}/editorial-policy`)).text();
  assert.match(about, /نمودارا چرا ساخته شد/);
  assert.match(policy, /سیاست تحریریهٔ نمودارا/);
  assert.match(policy, /مثال‌های کد چگونه تست می‌شوند/);

  const sitemap = await (await fetch(`${server.url}/sitemap.xml`)).text();
  assert.match(sitemap, /https:\/\/nemodara\.ir\/articles\/diagram-as-code-for-teams/);
  assert.match(sitemap, /https:\/\/nemodara\.ir\/editorial-policy/);
  const llms = await (await fetch(`${server.url}/llms.txt`)).text();
  assert.match(llms, /مقاله‌های تحلیلی/);

  const editor = await (await fetch(`${server.url}/editor`)).text();
  assert.match(editor, /نمودارا/);
  assert.match(editor, /id="btn-command"/);
  assert.match(editor, /id="diagnostics-panel"/);
  assert.match(editor, /editor-experience\.js/);
  assert.doesNotMatch(editor, /data-ad-slot=/);

  const unauthorized = await fetch(`${server.url}/admin/content`, { redirect: 'manual' });
  assert.equal(unauthorized.status, 401);
  const admin = await fetch(`${server.url}/admin/content`, { headers: { authorization } });
  assert.equal(admin.status, 200);
  assert.match(await admin.text(), /اتاق عملیات محتوا/);

  const today = new Date().toISOString().slice(0, 10);
  await event(server.url, { event: 'page_view', session: 'content-a', path: '/articles/diagram-as-code-for-teams', referrer: 'google.com' });
  await event(server.url, { event: 'engagement', session: 'content-a', path: '/articles/diagram-as-code-for-teams', seconds: 55 });
  await event(server.url, { event: 'editor_open', session: 'content-a', path: '/articles/diagram-as-code-for-teams' });
  await body(await fetch(`${server.url}/api/admin/analytics/search`, {
    method: 'POST', headers: { authorization, 'content-type': 'application/json' },
    body: JSON.stringify({ rows: [{ date: today, query: 'diagram as code', page: 'https://nemodara.ir/articles/diagram-as-code-for-teams', clicks: 2, impressions: 180, position: 5.2 }] }),
  }));

  const created = await body(await fetch(`${server.url}/api/admin/content/briefs`, {
    method: 'POST', headers: { authorization, 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'بهبود مقاله Diagram as Code', contentType: 'update', status: 'research', priority: 2, owner: 'تحریریه', dueDate: today, targetQuery: 'diagram as code', targetUrl: '/articles/diagram-as-code-for-teams', angle: 'اضافه‌کردن نمونهٔ بازبینی Pull Request' }),
  }));
  assert.equal(created.contentType, 'update');

  const overview = await body(await fetch(`${server.url}/api/admin/content/overview?days=30`, { headers: { authorization } }));
  assert.ok(overview.metrics.totalContent >= 12);
  assert.ok(overview.inventory.some((item) => item.path === '/articles/diagram-as-code-for-teams'));
  assert.ok(overview.briefs.some((brief) => brief.id === created.id));
  assert.ok(Array.isArray(overview.opportunities));

  const updated = await body(await fetch(`${server.url}/api/admin/content/briefs/${encodeURIComponent(created.id)}`, {
    method: 'PUT', headers: { authorization, 'content-type': 'application/json' },
    body: JSON.stringify({ ...created, status: 'writing', notes: 'نمونهٔ واقعی اضافه شود' }),
  }));
  assert.equal(updated.status, 'writing');

  const crossSite = await fetch(`${server.url}/api/admin/content/briefs`, {
    method: 'POST', headers: { authorization, origin: 'https://attacker.example', 'content-type': 'application/json' }, body: '{}',
  });
  assert.equal(crossSite.status, 403);

  const codes = EDITORIAL_ARTICLES.flatMap((article) => article.sections.map((section) => section.code).filter(Boolean));
  for (const code of codes) {
    const response = await fetch(`${server.url}/api/render`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, format: 'svg' }),
    });
    assert.equal(response.status, 200, code.slice(0, 40));
    assert.match(response.headers.get('content-type') || '', /image\/svg\+xml/);
  }

  const deletion = await fetch(`${server.url}/api/admin/content/briefs/${encodeURIComponent(created.id)}`, { method: 'DELETE', headers: { authorization } });
  assert.equal(deletion.status, 204);
});
