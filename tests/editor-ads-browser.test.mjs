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
    ANALYTICS_ENABLED: 'true',
    ANALYTICS_DATA_DIR: directory,
    ANALYTICS_TIME_ZONE: 'UTC',
    ANALYTICS_ADMIN_USER: 'owner',
    ANALYTICS_ADMIN_PASSWORD: 'editor-browser-test-password-0123456789',
    ANALYTICS_HASH_SECRET: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    ADS_ENABLED: 'true',
    ADS_PROVIDER: 'yektanet',
    ADS_SCRIPT_URL: 'https://cdn.yektanet.com/rg_woebegone/scripts_v3/test/rg.complete.js',
    ADS_SCRIPT_ID: 'ua-script-editor-browser-test',
    ADS_ALLOWED_ORIGINS: 'https://cdn.yektanet.com,https://*.yektanet.com',
    ADS_EDITOR_ENABLED: 'true',
    ADS_EDITOR_REQUIRE_CROSS_ORIGIN: 'true',
    ADS_EDITOR_FRAME_ORIGIN: 'http://ads.test',
    ADS_EDITOR_TRAFFIC_PERCENT: '100',
    ADS_EDITOR_LOAD_DELAY_MS: '0',
    ADS_SLOT_EDITOR_RAIL: 'pos-editor-rail-browser',
    ADS_SLOT_EDITOR_DOCK: 'pos-editor-dock-browser',
  };
}

async function preparePage(browser, viewport) {
  const page = await browser.newPage();
  await page.setViewport({ ...viewport, deviceScaleFactor: 1 });
  await page.setRequestInterception(true);
  page.on('request', async (request) => {
    const url = new URL(request.url());
    if (url.hostname !== 'ads.test') return request.continue();
    const slot = url.searchParams.get('slot') || 'unknown';
    return request.respond({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      headers: { 'X-Robots-Tag': 'noindex,nofollow' },
      body: `<!doctype html><html><body style="margin:0"><div id="mock-ad" style="width:100%;height:100%;background:#e7eee9">${slot}</div><script>parent.postMessage({source:'nemodara-editor-ad',slot:${JSON.stringify(slot)},type:'loaded'},'*')</script></body></html>`,
    });
  });
  return page;
}

function rectanglesOverlap(a, b) {
  return !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
}

test('isolated editor advertising preserves professional desktop and mobile layouts', { timeout: 120_000 }, async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'nemodara-editor-ads-browser-'));
  const server = await startServer({ port: 0, host: '127.0.0.1', environment: environment(directory), logger: { error() {} } });
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  t.after(async () => {
    await browser.close();
    await server.close();
    await fs.rm(directory, { recursive: true, force: true });
  });

  const errors = [];
  const desktop = await preparePage(browser, { width: 1600, height: 900 });
  desktop.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  desktop.on('pageerror', (error) => errors.push(error.message));
  await desktop.goto(`${server.url}/editor`, { waitUntil: 'networkidle0' });
  await desktop.waitForFunction(() => document.querySelector('[data-ad-slot="editorRail"]')?.dataset.adState === 'loaded');

  const desktopLayout = await desktop.evaluate(() => {
    const rect = (selector) => {
      const value = document.querySelector(selector).getBoundingClientRect();
      return { left: value.left, right: value.right, top: value.top, bottom: value.bottom, width: value.width, height: value.height };
    };
    return {
      rail: rect('[data-ad-slot="editorRail"]'),
      workspace: rect('#workspace'),
      exportButton: rect('#btn-export-dialog'),
      railDisplay: getComputedStyle(document.querySelector('[data-ad-slot="editorRail"]')).display,
      dockDisplay: getComputedStyle(document.querySelector('[data-ad-slot="editorDock"]')).display,
      parentPublisherScripts: [...document.scripts].filter((script) => /yektanet|tapsell/i.test(script.src)).length,
      frameOrigin: new URL(document.querySelector('[data-ad-slot="editorRail"] iframe').src).origin,
      overflow: document.documentElement.scrollWidth - window.innerWidth,
    };
  });
  assert.equal(desktopLayout.railDisplay, 'block');
  assert.equal(desktopLayout.dockDisplay, 'none');
  assert.ok(desktopLayout.rail.width >= 295 && desktopLayout.rail.width <= 305, JSON.stringify(desktopLayout));
  assert.ok(desktopLayout.rail.height >= 500, JSON.stringify(desktopLayout));
  assert.ok(desktopLayout.workspace.width >= 900, JSON.stringify(desktopLayout));
  assert.equal(rectanglesOverlap(desktopLayout.rail, desktopLayout.exportButton), false);
  assert.equal(desktopLayout.parentPublisherScripts, 0);
  assert.equal(desktopLayout.frameOrigin, 'http://ads.test');
  assert.ok(desktopLayout.overflow <= 1, JSON.stringify(desktopLayout));

  const mobile = await preparePage(browser, { width: 390, height: 844 });
  mobile.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  mobile.on('pageerror', (error) => errors.push(error.message));
  await mobile.goto(`${server.url}/editor`, { waitUntil: 'networkidle0' });
  await mobile.waitForFunction(() => document.querySelector('[data-ad-slot="editorDock"]')?.dataset.adState === 'loaded');

  const mobileLayout = await mobile.evaluate(() => {
    const rect = (selector) => {
      const value = document.querySelector(selector).getBoundingClientRect();
      return { left: value.left, right: value.right, top: value.top, bottom: value.bottom, width: value.width, height: value.height };
    };
    return {
      dock: rect('[data-ad-slot="editorDock"]'),
      stage: rect('.editor-stage-layout'),
      railDisplay: getComputedStyle(document.querySelector('[data-ad-slot="editorRail"]')).display,
      dockDisplay: getComputedStyle(document.querySelector('[data-ad-slot="editorDock"]')).display,
      bodyWidth: document.body.scrollWidth,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      parentPublisherScripts: [...document.scripts].filter((script) => /yektanet|tapsell/i.test(script.src)).length,
    };
  });
  assert.equal(mobileLayout.railDisplay, 'none');
  assert.equal(mobileLayout.dockDisplay, 'block');
  assert.ok(mobileLayout.dock.height >= 82 && mobileLayout.dock.height <= 120, JSON.stringify(mobileLayout));
  assert.ok(mobileLayout.dock.bottom <= mobileLayout.viewportHeight + 1, JSON.stringify(mobileLayout));
  assert.ok(mobileLayout.stage.height >= 400, JSON.stringify(mobileLayout));
  assert.ok(mobileLayout.bodyWidth <= mobileLayout.viewportWidth + 2, JSON.stringify(mobileLayout));
  assert.equal(mobileLayout.parentPublisherScripts, 0);

  assert.deepEqual(errors, []);
});
