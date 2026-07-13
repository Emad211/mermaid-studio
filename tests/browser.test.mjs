import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer';
import { startServer } from '../src/server/app.js';

test('Persian landing and editor work in desktop and mobile browsers', { timeout: 90_000 }, async (t) => {
  const server = await startServer({ port: 0, host: '127.0.0.1' });
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  const screenshotDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'mermaid-studio-browser-'));

  t.after(async () => {
    await browser.close();
    await server.close();
    await fs.rm(screenshotDirectory, { recursive: true, force: true });
  });

  const page = await browser.newPage();
  const browserErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  page.on('pageerror', (error) => browserErrors.push(error.message));

  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  await page.goto(server.url + '/', { waitUntil: 'networkidle0' });
  assert.equal(await page.$eval('html', (element) => element.lang), 'fa');
  assert.equal(await page.$eval('html', (element) => element.dir), 'rtl');
  assert.match(await page.$eval('h1', (element) => element.textContent), /نمودار/);
  assert.ok(await page.$('a[href="/editor"]'));

  await page.goto(server.url + '/editor', { waitUntil: 'networkidle0' });
  await page.waitForSelector('.CodeMirror');
  await page.waitForSelector('#stage svg', { timeout: 30_000 });
  assert.match(await page.$eval('#status-msg', (element) => element.textContent), /آماده/);
  assert.match(await page.$eval('#type-chip', (element) => element.textContent), /فلوچارت/);

  await page.evaluate(() => {
    const codeMirror = document.querySelector('.CodeMirror').CodeMirror;
    codeMirror.setValue(
      'sequenceDiagram\n  participant U as کاربر\n  participant S as سامانه\n  U->>S: درخواست\n  S-->>U: پاسخ',
    );
  });
  await page.waitForFunction(() => document.querySelector('#type-chip')?.textContent.includes('توالی'));
  await page.waitForFunction(() => document.querySelector('#status-msg')?.classList.contains('ok'));
  assert.ok(await page.$('#stage svg'));

  const mobile = await browser.newPage();
  await mobile.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await mobile.goto(server.url + '/editor', { waitUntil: 'networkidle0' });
  await mobile.waitForSelector('#stage svg', { timeout: 30_000 });
  const dimensions = await mobile.evaluate(() => ({
    bodyWidth: document.body.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
  assert.ok(
    dimensions.bodyWidth <= dimensions.viewportWidth + 2,
    `mobile page has horizontal overflow: ${JSON.stringify(dimensions)}`,
  );

  assert.deepEqual(browserErrors, []);
});
