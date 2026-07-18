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
    SEO_LAST_MODIFIED: '2026-07-15',
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

async function inspectPage(page, url, expectedHeading) {
  const consoleErrors = [];
  const pageErrors = [];
  const onConsole = (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); };
  const onPageError = (error) => pageErrors.push(error.message);
  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  const response = await page.goto(url, { waitUntil: 'networkidle0' });
  assert.ok([200, 304].includes(response.status()), `unexpected status at ${url}: ${response.status()}`);
  assert.match(await page.$eval('h1', (node) => node.textContent), expectedHeading);
  const metrics = await page.evaluate(async () => {
    await document.fonts.ready;
    const heading = document.querySelector('h1');
    const header = document.querySelector('.site-header');
    return {
      viewport: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      title: document.title,
      canonical: document.querySelector('link[rel="canonical"]')?.href || '',
      robots: document.querySelector('meta[name="robots"]')?.content || '',
      brand: document.querySelector('.brand-copy strong')?.textContent?.trim() || '',
      nav: [...document.querySelectorAll('.site-header > .main-nav > a')].map((node) => node.textContent.trim()),
      headerHeight: Math.round(header?.getBoundingClientRect().height || 0),
      bodyFont: getComputedStyle(document.body).fontFamily,
      fontReady: document.fonts.check('16px "Vazirmatn Variable"', 'نمودارا'),
      headingSize: parseFloat(getComputedStyle(heading).fontSize),
    };
  });
  assert.ok(metrics.scrollWidth <= metrics.viewport + 2, `horizontal overflow at ${url}: ${JSON.stringify(metrics)}`);
  assert.equal(metrics.brand, 'نمودارا');
  assert.deepEqual(metrics.nav, ['خانه', 'آموزش', 'مجله', 'قالب‌ها', 'دربارهٔ ما']);
  assert.ok(metrics.headerHeight >= 60 && metrics.headerHeight <= 70, `header height at ${url}: ${metrics.headerHeight}`);
  assert.match(metrics.bodyFont, /Vazirmatn Variable/);
  assert.equal(metrics.fontReady, true);
  assert.ok(metrics.headingSize <= (metrics.viewport <= 720 ? 46 : 64), `oversized heading at ${url}: ${metrics.headingSize}px`);
  assert.match(metrics.canonical, /^https:\/\/nemodara\.ir\//);
  assert.doesNotMatch(metrics.robots, /noindex/);
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(pageErrors, []);
  page.off('console', onConsole);
  page.off('pageerror', onPageError);
  return metrics;
}

test('Nemodara landing, learning hub and long-form article are editorial and mobile-safe', { timeout: 150_000 }, async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'nemodara-editorial-'));
  const server = await startServer({ port: 0, host: '127.0.0.1', environment: environment(directory), logger: { error() {} } });
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
  t.after(async () => {
    await browser.close();
    await server.close();
    await fs.rm(directory, { recursive: true, force: true });
  });

  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => localStorage.setItem('mstudio:site-theme', 'light'));
  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  const landing = await inspectPage(page, `${server.url}/`, /نمودار خوب/);
  assert.match(landing.title, /نمودارا/);
  assert.equal(await page.$$eval('.use-case-grid article', (nodes) => nodes.length), 3);
  assert.equal(await page.$$eval('.lesson-card', (nodes) => nodes.length), 3);
  assert.equal(await page.$eval('.hero-demo', (node) => getComputedStyle(node).transform), 'none');
  const lightDemo = await page.evaluate(() => ({
    editorBackground: getComputedStyle(document.querySelector('.demo-editor')).backgroundColor,
    decisionColor: getComputedStyle(document.querySelector('.decision'), '::after').color,
    decisionContent: getComputedStyle(document.querySelector('.decision'), '::after').content,
  }));
  assert.match(lightDemo.editorBackground, /^rgb\(2[0-9]{2}, 2[0-9]{2}, 2[0-9]{2}\)$/);
  assert.doesNotMatch(lightDemo.decisionColor, /rgba\([^)]*, 0\)$/);
  assert.match(lightDemo.decisionContent, /کامل است/);

  await page.click('#theme-toggle');
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  const darkDemo = await page.evaluate(() => ({
    editorBackground: getComputedStyle(document.querySelector('.demo-editor')).backgroundColor,
    decisionColor: getComputedStyle(document.querySelector('.decision'), '::after').color,
  }));
  assert.match(darkDemo.editorBackground, /^rgb\([0-4]?[0-9], [0-4]?[0-9], [0-4]?[0-9]\)$/);
  assert.doesNotMatch(darkDemo.decisionColor, /rgba\([^)]*, 0\)$/);

  await inspectPage(page, `${server.url}/learn`, /Mermaid را برای حل مسئله/);
  assert.equal(await page.$$eval('.guide-card', (nodes) => nodes.length), 8);
  assert.equal(await page.$$eval('.path-card', (nodes) => nodes.length), 4);

  await inspectPage(page, `${server.url}/learn/flowchart-mermaid`, /آموزش فلوچارت Mermaid/);
  assert.ok(await page.$('.article-layout'));
  assert.ok(await page.$('.article-summary'));
  assert.equal(await page.$$eval('.article-section', (nodes) => nodes.length) >= 5, true);
  assert.equal(await page.$$eval('.article-aside [data-article-toc] a', (nodes) => nodes.length) >= 5, true);
  const articleTypography = await page.$eval('.article-section p', (node) => {
    const style = getComputedStyle(node);
    return { fontSize: parseFloat(style.fontSize), lineHeight: parseFloat(style.lineHeight) / parseFloat(style.fontSize) };
  });
  assert.ok(articleTypography.fontSize >= 15.5);
  assert.ok(articleTypography.lineHeight >= 1.95);

  await inspectPage(page, `${server.url}/templates`, /قالب مناسب/);
  await inspectPage(page, `${server.url}/articles`, /کمتر دربارهٔ شکل‌ها/);
  await inspectPage(page, `${server.url}/articles/diagram-as-code-for-teams`, /نمودار به‌صورت کد/);
  await inspectPage(page, `${server.url}/about`, /واضح‌ترکردن فکرهای فنی/);
  await inspectPage(page, `${server.url}/privacy`, /حریم خصوصی/);
  await inspectPage(page, `${server.url}/terms`, /شرایط استفاده/);

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await inspectPage(page, `${server.url}/`, /نمودار خوب/);
  assert.equal(await page.$eval('.mobile-menu', (node) => getComputedStyle(node).display !== 'none'), true);
  await inspectPage(page, `${server.url}/learn`, /Mermaid را برای حل مسئله/);
  await inspectPage(page, `${server.url}/learn/flowchart-mermaid`, /آموزش فلوچارت Mermaid/);
  assert.equal(await page.$eval('.mobile-toc', (node) => getComputedStyle(node).display !== 'none'), true);
  assert.equal(await page.$eval('.article-aside', (node) => getComputedStyle(node).display), 'none');
});

test('Nemodara SEO metadata and sitemap use the production brand and domain', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'nemodara-seo-'));
  const server = await startServer({ port: 0, host: '127.0.0.1', environment: environment(directory), logger: { error() {} } });
  t.after(async () => {
    await server.close();
    await fs.rm(directory, { recursive: true, force: true });
  });

  const landing = await (await fetch(`${server.url}/`)).text();
  assert.match(landing, /نمودارا/);
  assert.match(landing, /https:\/\/nemodara\.ir\//);
  assert.doesNotMatch(landing, /Mermaid Studio \| ادیتور فارسی/);

  const article = await (await fetch(`${server.url}/learn/sequence-diagram-mermaid`)).text();
  assert.match(article, /تیم تحریریه نمودارا|نمودارا/);
  assert.match(article, /article-summary/);
  assert.match(article, /data-article-toc/);

  const sitemap = await (await fetch(`${server.url}/sitemap.xml`)).text();
  assert.match(sitemap, /https:\/\/nemodara\.ir\/learn\/flowchart-mermaid/);
});
