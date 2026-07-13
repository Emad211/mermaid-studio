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
    SITE_URL: 'https://diagram.example.com',
    SITE_NAME: 'Mermaid Studio',
    SEO_LAST_MODIFIED: '2026-07-13',
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

test('admin growth control center works in desktop and mobile browsers', { timeout: 120_000 }, async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mstudio-admin-browser-'));
  const env = environment(directory);
  const server = await startServer({ port: 0, host: '127.0.0.1', environment: env, logger: { error() {} } });
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  t.after(async () => {
    await browser.close();
    await server.close();
    await fs.rm(directory, { recursive: true, force: true });
  });

  const page = await browser.newPage();
  await page.authenticate({ username: env.ANALYTICS_ADMIN_USER, password: env.ANALYTICS_ADMIN_PASSWORD });
  await page.setViewport({ width: 1500, height: 1050, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto(`${server.url}/admin/analytics`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => document.querySelector('#dashboard-status')?.classList.contains('ok'), { timeout: 30_000 });
  assert.equal(await page.$$eval('.admin-nav-item', (nodes) => nodes.length), 6);
  assert.match(await page.$eval('h1', (node) => node.textContent), /مرکز کنترل درآمد/);
  assert.equal(await page.$eval('[data-view-panel="overview"]', (node) => node.classList.contains('is-active')), true);

  await page.click('[data-admin-view="audit"]');
  await page.waitForFunction(() => document.querySelector('[data-view-panel="audit"]')?.classList.contains('is-active'));
  await page.click('#run-seo-audit');
  await page.waitForFunction(() => document.querySelector('#audit-score')?.textContent !== '—' && !document.querySelector('#run-seo-audit')?.disabled, { timeout: 45_000 });
  const score = Number((await page.$eval('#audit-score', (node) => node.textContent)).replace(/[^0-9.]/g, ''));
  assert.ok(score >= 70, `unexpected browser SEO score: ${score}`);

  await page.click('[data-admin-view="settings"]');
  await page.waitForFunction(() => document.querySelector('[data-view-panel="settings"]')?.classList.contains('is-active'));
  await page.$eval('#goals-form [name="monthlyPageviews"]', (input) => { input.value = '12000'; });
  await page.click('#goals-form button[type="submit"]');
  await page.waitForFunction(() => document.querySelector('#goals-message')?.classList.contains('ok'));

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await page.click('#sidebar-toggle');
  assert.equal(await page.$eval('body', (node) => node.classList.contains('sidebar-open')), true);
  const dimensions = await page.evaluate(() => ({ bodyWidth: document.body.scrollWidth, viewportWidth: window.innerWidth }));
  assert.ok(dimensions.bodyWidth <= dimensions.viewportWidth + 2, `admin mobile overflow: ${JSON.stringify(dimensions)}`);

  assert.deepEqual(errors, []);
});
