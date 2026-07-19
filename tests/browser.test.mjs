import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer';
import { startServer } from '../src/server/app.js';

test('Persian landing and editor work in desktop and mobile browsers', { timeout: 90_000 }, async (t) => {
  const server = await startServer({ port: 0, host: '127.0.0.1' });
  let browser;
  let screenshotDirectory;

  t.after(async () => {
    await browser?.close();
    await server.close();
    if (screenshotDirectory) await fs.rm(screenshotDirectory, { recursive: true, force: true });
  });

  browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  screenshotDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'mermaid-studio-browser-'));

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
  await page.waitForFunction(() => Boolean(document.querySelector('#stage')?.shadowRoot?.querySelector('svg')), { timeout: 30_000 });
  assert.match(await page.$eval('#status-msg', (element) => element.textContent), /آماده/);
  assert.match(await page.$eval('#type-chip', (element) => element.textContent), /فلوچارت/);
  assert.deepEqual(await page.evaluate(() => ({
    editor: document.querySelector('.CodeMirror textarea')?.getAttribute('aria-label'),
    config: document.querySelector('#config-input')?.getAttribute('aria-label'),
    css: document.querySelector('#css-input')?.getAttribute('aria-label'),
  })), {
    editor: 'کد Mermaid',
    config: 'تنظیمات JSON مرمید',
    css: 'CSS اختصاصی نمودار',
  });
  const shareSafety = await page.evaluate(async () => {
    const { decodeState, encodeState, readHashState } = await import('/js/share.js');
    const valid = { code: 'flowchart TD\n A-->B', theme: 'default', layout: 'dagre', background: 'white', config: '', css: '' };
    const roundTrip = decodeState(encodeState(valid));
    history.replaceState(null, '', '#code=%');
    const malformed = readHashState();
    history.replaceState(null, '', '/editor');
    let oversizedRejected = false;
    try { encodeState({ ...valid, code: 'A'.repeat(100_001) }); } catch { oversizedRejected = true; }
    const compressed = window.pako.deflate(JSON.stringify({ ...valid, code: 'A'.repeat(250_000) }));
    let binary = '';
    compressed.forEach((byte) => { binary += String.fromCharCode(byte); });
    const compressedBomb = decodeState(`p:${btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`);
    return { roundTripCode: roundTrip?.code, malformed, oversizedRejected, compressedBomb };
  });
  assert.equal(shareSafety.roundTripCode, 'flowchart TD\n A-->B');
  assert.equal(shareSafety.malformed, null);
  assert.equal(shareSafety.oversizedRejected, true);
  assert.equal(shareSafety.compressedBomb, null);

  await page.evaluate(() => {
    const codeMirror = document.querySelector('.CodeMirror').CodeMirror;
    codeMirror.setValue(
      'sequenceDiagram\n  participant U as کاربر\n  participant S as سامانه\n  U->>S: درخواست\n  S-->>U: پاسخ',
    );
  });
  await page.waitForFunction(() => document.querySelector('#type-chip')?.textContent.includes('توالی'));
  await page.waitForFunction(() => document.querySelector('#status-msg')?.classList.contains('ok'));
  assert.equal(await page.evaluate(() => Boolean(document.querySelector('#stage')?.shadowRoot?.querySelector('svg'))), true);

  await page.$eval('#css-input', (input) => {
    input.value = 'body { display: none !important; }\n#workspace { opacity: 0.01 !important; }';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForFunction(() => document.querySelector('#stage')?.shadowRoot?.querySelector('style')?.textContent.includes('body'));
  const isolatedCss = await page.evaluate(() => ({
    bodyDisplay: getComputedStyle(document.body).display,
    workspaceOpacity: getComputedStyle(document.querySelector('#workspace')).opacity,
    hasShadowRoot: Boolean(document.querySelector('#stage')?.shadowRoot),
    hasDiagramStyle: Boolean(document.querySelector('#stage')?.shadowRoot?.querySelector('style')),
  }));
  assert.notEqual(isolatedCss.bodyDisplay, 'none');
  assert.equal(isolatedCss.workspaceOpacity, '1');
  assert.equal(isolatedCss.hasShadowRoot, true);
  assert.equal(isolatedCss.hasDiagramStyle, true);
  await page.$eval('#css-input', (input) => {
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForFunction(() => ![...document.querySelector('#stage')?.shadowRoot?.querySelectorAll('style') || []]
    .some((node) => node.textContent.includes('body')));
  const exportProbe = await page.evaluate(async () => {
    const { clientRaster, serializeSvg } = await import('/js/exporter.js');
    const svg = document.querySelector('#stage')?.shadowRoot?.querySelector('svg');
    const serialized = serializeSvg(svg);
    const png = await clientRaster(svg, { format: 'png', scale: 1, background: 'white' });
    return { serialized, pngType: png.type, pngSize: png.size };
  });
  assert.match(exportProbe.serialized, /<svg/);
  assert.equal(exportProbe.pngType, 'image/png');
  assert.ok(exportProbe.pngSize > 1_000);

  const mobile = await browser.newPage();
  await mobile.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await mobile.goto(server.url + '/editor', { waitUntil: 'networkidle0' });
  await mobile.waitForFunction(() => Boolean(document.querySelector('#stage')?.shadowRoot?.querySelector('svg')), { timeout: 30_000 });
  const dimensions = await mobile.evaluate(() => ({
    bodyWidth: document.body.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
  assert.ok(
    dimensions.bodyWidth <= dimensions.viewportWidth + 2,
    `mobile page has horizontal overflow: ${JSON.stringify(dimensions)}`,
  );

  const malformedShare = await browser.newPage();
  await malformedShare.goto(server.url + '/editor#code=%', { waitUntil: 'networkidle0' });
  await malformedShare.waitForFunction(() => Boolean(window.nemodaraEditor));
  await malformedShare.waitForFunction(() => Boolean(document.querySelector('#stage')?.shadowRoot?.querySelector('svg')));
  assert.doesNotMatch(await malformedShare.$eval('#status-msg', (node) => node.textContent), /ناموفق/);
  await malformedShare.close();

  assert.deepEqual(browserErrors, []);
});
