import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer';
import { startServer } from '../src/server/app.js';

function environment(directory) {
  return {
    NODE_ENV: 'test',
    SITE_URL: 'https://nemodara.ir',
    SITE_NAME: 'نمودارا',
    SEO_LAST_MODIFIED: '2026-07-23',
    SEO_AUTHOR_NAME: 'تیم تحریریه نمودارا',
    ANALYTICS_ENABLED: 'true',
    ANALYTICS_DATA_DIR: directory,
    ANALYTICS_TIME_ZONE: 'UTC',
    ANALYTICS_ADMIN_USER: 'owner',
    ANALYTICS_ADMIN_PASSWORD: 'a-very-long-random-password-12345',
    ANALYTICS_HASH_SECRET: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    ADS_ENABLED: 'false',
    GSC_ENABLED: 'false',
    INDEXNOW_ENABLED: 'false',
  };
}

async function openPage(page, url) {
  const response = await page.goto(url, { waitUntil: 'networkidle0' });
  assert.ok([200, 304].includes(response.status()), `${url} returned ${response.status()}`);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2), `horizontal overflow at ${url}`);
}

test('daily tutorials and templates are discoverable and mixed Persian/English text is isolated', { timeout: 120_000 }, async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'nemodara-bidi-'));
  const server = await startServer({ port: 0, host: '127.0.0.1', environment: environment(directory), logger: { error() {} } });
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
  t.after(async () => {
    await browser.close();
    await server.close();
    await fs.rm(directory, { recursive: true, force: true });
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });

  await openPage(page, `${server.url}/learn`);
  assert.ok(await page.$$eval('.guide-card', (nodes) => nodes.length) >= 10);
  assert.ok(await page.$('a[data-tutorial-slug="state-diagram-mermaid"]'));
  assert.ok(await page.$('a[data-tutorial-slug="kanban-mermaid"]'));

  await openPage(page, `${server.url}/learn/state-diagram-mermaid`);
  assert.ok(await page.$$eval('bdi.latin-run[dir="ltr"]', (nodes) => nodes.length) >= 5);

  await openPage(page, `${server.url}/learn/kanban-mermaid`);
  assert.ok(await page.$$eval('bdi.latin-run[dir="ltr"]', (nodes) => nodes.length) >= 5);

  await openPage(page, `${server.url}/templates`);
  assert.ok(await page.$('#template-order-state'));
  assert.ok(await page.$('#template-order-state a[href="/learn/state-diagram-mermaid"]'));
  assert.ok(await page.$('#template-order-state a[href="/articles/state-diagram-vs-flowchart"]'));
  assert.ok(await page.$('#template-content-release-kanban'));
  assert.ok(await page.$('#template-content-release-kanban a[href="/learn/kanban-mermaid"]'));
  assert.ok(await page.$('#template-content-release-kanban a[href="/articles/kanban-vs-gantt-for-team-work"]'));

  await openPage(page, `${server.url}/articles/state-diagram-vs-flowchart`);
  assert.ok(await page.$$eval('.docs-sidebar bdi.latin-run[dir="ltr"]', (nodes) => nodes.length) >= 2);
  const links = await page.$$eval('.docs-sidebar nav a', (nodes) => nodes.map((node) => ({
    height: node.getBoundingClientRect().height,
    lineHeight: parseFloat(getComputedStyle(node).lineHeight),
  })));
  assert.ok(links.length >= 5);
  assert.ok(links.every((item) => item.height > 0 && item.lineHeight >= 20));

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await openPage(page, `${server.url}/articles/kanban-vs-gantt-for-team-work`);
  assert.equal(await page.$eval('.docs-sidebar', (node) => getComputedStyle(node).display), 'none');
});

test('source HTML contains standard crawlable links before client rendering', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'nemodara-source-links-'));
  const server = await startServer({ port: 0, host: '127.0.0.1', environment: environment(directory), logger: { error() {} } });
  t.after(async () => {
    await server.close();
    await fs.rm(directory, { recursive: true, force: true });
  });

  const learn = await (await fetch(`${server.url}/learn`)).text();
  assert.match(learn, /data-tutorial-slug="state-diagram-mermaid"/);
  assert.match(learn, /href="\/learn\/state-diagram-mermaid"/);
  assert.match(learn, /data-tutorial-slug="kanban-mermaid"/);
  assert.match(learn, /href="\/learn\/kanban-mermaid"/);

  const templates = await (await fetch(`${server.url}/templates`)).text();
  assert.match(templates, /data-template-id="order-state"/);
  assert.match(templates, /href="\/learn\/state-diagram-mermaid"/);
  assert.match(templates, /href="\/articles\/state-diagram-vs-flowchart"/);
  assert.match(templates, /data-template-id="content-release-kanban"/);
  assert.match(templates, /href="\/learn\/kanban-mermaid"/);
  assert.match(templates, /href="\/articles\/kanban-vs-gantt-for-team-work"/);
});
