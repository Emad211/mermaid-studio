import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  insertObjectAfterMarker,
  syncContentText,
  validateEntry,
} from '../scripts/publish-daily-content.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const entry = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'content', 'daily', '2026-07-21-state-diagram.json'),
  'utf8',
));

function fixtures() {
  return {
    articles: `const UPDATED = '2026-07-15';
export const EDITORIAL_ARTICLES = [
  { slug: 'existing-article' },
];
function escapeHtml(value) { return value; }
function relatedLearnLinks() {
  const titles = {
    'architecture-diagram-mermaid': 'آموزش نمودار معماری',
  };
}
const page = \`<span>انتشار و بازبینی: ۲۴ تیر ۱۴۰۵</span>\`;
`,
    tutorials: `const UPDATED = '2026-07-15';
export const LEARN_ARTICLES = [
  { slug: 'existing-tutorial' },
];
function escapeHtml(value) { return value; }
const page = \`<span>به‌روزرسانی ۲۴ تیر ۱۴۰۵</span>\`;
`,
    templates: `const templates = [
  { id: 'existing-template' },
];
`,
    seo: `const templateNames = [
          'گانت انتشار', 'نقشه ذهنی محتوا', 'معماری ابری', 'سفر کاربر',
        ].map(Boolean);
`,
    editorialTests: `assert.equal(await page.$$eval('.guide-card', (nodes) => nodes.length), 8);
`,
  };
}

test('daily content entry passes editorial quality gates', () => {
  assert.equal(validateEntry(entry, 'fixture'), entry);
});

test('object insertion is idempotent for generated JSON syntax', () => {
  const marker = 'const records = [';
  const pattern = /["']?slug["']?\s*:\s*["']new-page["']/;
  const once = insertObjectAfterMarker(`${marker}\n];`, marker, { slug: 'new-page' }, pattern);
  const twice = insertObjectAfterMarker(once, marker, { slug: 'new-page' }, pattern);
  assert.equal(once, twice);
});

test('publisher adds article, tutorial and template once and fixes visible dates', () => {
  const once = syncContentText(fixtures(), [entry]);
  const twice = syncContentText(once, [entry]);

  assert.deepEqual(twice, once);
  assert.match(once.articles, /state-diagram-vs-flowchart/);
  assert.match(once.tutorials, /state-diagram-mermaid/);
  assert.match(once.templates, /order-state/);
  assert.match(once.seo, /چرخهٔ وضعیت سفارش/);
  assert.match(once.articles, /formatPersianDate\(article\.updated/);
  assert.match(once.tutorials, /formatPersianDate\(article\.updated/);
  assert.match(once.editorialTests, /nodes\.length\) >= 8/);
});
