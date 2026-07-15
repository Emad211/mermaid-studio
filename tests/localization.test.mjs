import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('editor shell is Persian, keeps source code left-to-right and has no ad loader', async () => {
  const html = await read('public/index.html');
  assert.match(html, /<html[^>]+lang="fa"[^>]+dir="rtl"/);
  assert.match(html, /کد Mermaid/);
  assert.match(html, /id="config-input"[^>]+dir="ltr"/);
  assert.match(html, /id="css-input"[^>]+dir="ltr"/);
  assert.doesNotMatch(html, /data-ad-slot=/);
  assert.doesNotMatch(html, /\/js\/ads\.js/);
});

test('editor controller uses a Persian starter diagram and Persian feedback', async () => {
  const source = await read('public/js/app.js');
  assert.match(source, /A\[دریافت درخواست\]/);
  assert.match(source, /در حال ساخت نمودار/);
  assert.match(source, /لینک اشتراک‌گذاری کپی شد/);
  assert.doesNotMatch(source, /Rendered in \$\{/);
  assert.doesNotMatch(source, /Syntax error/);
});

test('ordinary raster exports are attempted locally before the server fallback', async () => {
  const source = await read('public/js/exporter.js');
  const clientCall = source.indexOf('return await clientRaster');
  const fallbackCall = source.indexOf('return await serverRender', clientCall);
  assert.ok(clientCall > 0, 'client-side raster path should exist');
  assert.ok(fallbackCall > clientCall, 'server rendering should only be the fallback');
  assert.match(source, /MAX_RASTER_PIXELS/);
});

test('landing, templates and learning pages expose Nemodara Persian entry points and ad slots', async () => {
  const landing = await read('public/landing.html');
  const templates = await read('public/templates.html');
  const learn = await read('public/learn.html');
  assert.match(landing, /نمودارا/);
  assert.match(landing, /ساخت اولین نمودار/);
  assert.match(landing, /href="\/editor"/);
  assert.match(landing, /href="\/learn"/);
  assert.match(landing, /data-ad-slot="homeInline"/);
  assert.match(templates, /data-ad-slot="templatesInline"/);
  assert.match(learn, /Mermaid را برای حل مسئله/);
  assert.match(learn, /data-ad-slot="learnInline"/);
});
