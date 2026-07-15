import test from 'node:test';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { startServer } from '../src/server/app.js';

function environment() {
  return {
    NODE_ENV: 'test',
    SITE_URL: 'https://nemodara.ir',
    SITE_NAME: 'نمودارا',
    ANALYTICS_ENABLED: 'false',
    ADS_ENABLED: 'false',
    PUPPETEER_NO_SANDBOX: 'true',
  };
}

test('Nemodara editor exposes commands, diagnostics and a focused mobile workflow', { timeout: 120_000 }, async (t) => {
  const server = await startServer({ port: 0, host: '127.0.0.1', environment: environment(), logger: { error() {} } });
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
  t.after(async () => {
    await browser.close();
    await server.close();
  });

  const page = await browser.newPage();
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewport({ width: 1440, height: 960, deviceScaleFactor: 1 });
  await page.goto(`${server.url}/editor`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => Boolean(window.nemodaraEditor));
  await page.evaluate(() => {
    window.__diagnosticCount = 0;
    window.addEventListener('nemodara:diagnostic', () => { window.__diagnosticCount += 1; });
  });
  assert.match(await page.title(), /نمودارا/);
  assert.equal(await page.$eval('#save-state', (node) => node.textContent.includes('ذخیره')), true);

  await page.click('#btn-command');
  await page.waitForSelector('#command-modal.show');
  await page.type('#command-input', 'Sequence');
  await page.waitForFunction(() => document.querySelectorAll('#command-list .command-item').length > 0);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.nemodaraEditor.getCode().includes('sequenceDiagram'));
  assert.equal(await page.$eval('#command-modal', (node) => node.classList.contains('show')), false);

  await page.evaluate(() => window.nemodaraEditor.setCode('flowchart TD\n  A[شروع --> B'));
  await page.waitForFunction(() => document.querySelector('#diagnostics-panel')?.classList.contains('has-error'), { timeout: 20_000 });
  assert.match(await page.$eval('#diagnostics-title', (node) => node.textContent), /اصلاح/);
  assert.ok(await page.$$eval('#diagnostics-body li', (nodes) => nodes.length) >= 1);
  assert.equal(await page.$('#preview-error'), null);
  assert.equal(await page.$$eval('.error-icon, .error-text, [id^="dmstudio-"]', (nodes) => nodes.length), 0);

  const invalidDiagnosticCount = await page.evaluate(() => window.__diagnosticCount);
  await page.evaluate(() => window.nemodaraEditor.setCode('flowchart TD\n  A['));
  await new Promise((resolve) => setTimeout(resolve, 500));
  assert.equal(await page.evaluate(() => window.__diagnosticCount), invalidDiagnosticCount + 1, 'one edit must trigger one render');
  assert.equal(await page.$$eval('.error-icon, .error-text, [id^="dmstudio-"]', (nodes) => nodes.length), 0);

  await page.evaluate(() => window.nemodaraEditor.setCode('flowchart TD\n  A[شروع] --> B[پایان]'));
  await page.waitForFunction(() => document.querySelector('#diagnostics-panel')?.classList.contains('is-clean'), { timeout: 20_000 });

  const examples = await page.$$eval('#examples-select option', (options) => options.filter((option) => option.value).map((option) => option.value));
  for (const example of examples) {
    const diagnosticCount = await page.evaluate(() => window.__diagnosticCount);
    await page.select('#examples-select', example);
    await page.waitForFunction((count) => window.__diagnosticCount > count, { timeout: 20_000 }, diagnosticCount);
    assert.equal(await page.$eval('#diagnostics-panel', (node) => node.classList.contains('is-clean')), true, `example failed: ${example}`);
    assert.equal(await page.$$eval('.error-icon, .error-text, [id^="dmstudio-"]', (nodes) => nodes.length), 0, `orphan render output: ${example}`);
  }

  await page.click('#btn-command');
  await page.type('#command-input', 'classDef');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.nemodaraEditor.getCode().startsWith('flowchart TD') && document.querySelector('#diagnostics-panel')?.classList.contains('is-clean'));
  assert.match(await page.evaluate(() => window.nemodaraEditor.getCode()), /classDef accent/);

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await page.waitForSelector('.mobile-pane-switch', { visible: true });
  await page.click('[data-mobile-pane="preview"]');
  assert.equal(await page.$eval('body', (node) => node.dataset.mobilePane), 'preview');
  assert.equal(await page.$eval('.preview-pane', (node) => getComputedStyle(node).visibility), 'visible');
  await page.click('[data-mobile-pane="editor"]');
  assert.equal(await page.$eval('body', (node) => node.dataset.mobilePane), 'editor');
  const dimensions = await page.evaluate(() => ({ viewport: window.innerWidth, scroll: document.documentElement.scrollWidth }));
  assert.ok(dimensions.scroll <= dimensions.viewport + 2, `mobile overflow: ${JSON.stringify(dimensions)}`);

  assert.deepEqual(errors, []);
});
