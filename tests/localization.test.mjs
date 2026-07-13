import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('editor shell is Persian and keeps source code left-to-right', async () => {
  const html = await read('public/editor.html');
  assert.match(html, /<html[^>]+lang="fa"[^>]+dir="rtl"/);
  assert.match(html, /کد Mermaid/);
  assert.match(html, /id="config-input"[^>]+dir="ltr"/);
  assert.match(html, /id="css-input"[^>]+dir="ltr"/);
});

test('editor controller uses a Persian starter diagram and Persian feedback', async () => {
  const source = await read('public/js/app.js');
  assert.match(source, /A\[شروع\]/);
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

test('landing page exposes Persian product entry points', async () => {
  const html = await read('public/index.html');
  assert.match(html, /شروع ساخت نمودار/);
  assert.match(html, /href="\/editor"/);
  assert.match(html, /href="\/learn"/);
});
