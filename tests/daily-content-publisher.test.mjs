import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  insertObjectAfterMarker,
  syncContentText,
  upsertObjectAfterMarker,
  validateEntry,
} from '../scripts/publish-daily-content.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const packageDir = path.join(ROOT, 'content', 'daily', '2026-07-21-state-diagram');
const entry = {
  ...JSON.parse(fs.readFileSync(path.join(packageDir, 'manifest.json'), 'utf8')),
  article: JSON.parse(fs.readFileSync(path.join(packageDir, 'article.json'), 'utf8')),
  tutorial: JSON.parse(fs.readFileSync(path.join(packageDir, 'tutorial.json'), 'utf8')),
  template: JSON.parse(fs.readFileSync(path.join(packageDir, 'template.json'), 'utf8')),
};

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

test('object upsert replaces the matching top-level record and stays idempotent', () => {
  const marker = 'const records = [';
  const pattern = /["']?slug["']?\s*:\s*["']new-page["']/;
  const source = `${marker}\n  {\n    "slug": "new-page",\n    "title": "Old title",\n    "nested": { "note": "brace } inside a string" }\n  },\n  { slug: 'other-page', title: 'Keep me' },\n];`;
  const value = { slug: 'new-page', title: 'New title', nested: { note: 'updated' } };
  const once = upsertObjectAfterMarker(source, marker, value, pattern);
  const twice = upsertObjectAfterMarker(once, marker, value, pattern);

  assert.match(once, /"title": "New title"/);
  assert.doesNotMatch(once, /Old title/);
  assert.match(once, /other-page/);
  assert.equal(twice, once);
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

test('publisher refreshes an existing cluster and updates its structured-data title', () => {
  const first = syncContentText(fixtures(), [entry]);
  const refreshed = structuredClone(entry);
  refreshed.article.title = 'عنوان تحلیلی تازه برای آزمون به‌روزرسانی صفحهٔ موجود';
  refreshed.tutorial.title = 'عنوان آموزش تازه و کامل برای آزمون به‌روزرسانی صفحهٔ موجود';
  refreshed.template.title = 'قالب تازهٔ چرخهٔ سفارش';

  const second = syncContentText(first, [refreshed]);
  const third = syncContentText(second, [refreshed]);

  assert.match(second.articles, /عنوان تحلیلی تازه/);
  assert.doesNotMatch(second.articles, new RegExp(entry.article.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(second.tutorials, /عنوان آموزش تازه/);
  assert.doesNotMatch(second.tutorials, new RegExp(entry.tutorial.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(second.templates, /قالب تازهٔ چرخهٔ سفارش/);
  assert.doesNotMatch(second.templates, new RegExp(entry.template.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(second.seo, /قالب تازهٔ چرخهٔ سفارش/);
  assert.doesNotMatch(second.seo, new RegExp(entry.template.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.deepEqual(third, second);
});
