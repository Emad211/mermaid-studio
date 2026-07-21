#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CONTENT_DIR = path.join(ROOT, 'content', 'daily');

const TARGETS = Object.freeze({
  articles: path.join(ROOT, 'src', 'server', 'article-content.js'),
  tutorials: path.join(ROOT, 'src', 'server', 'learn-content.js'),
  templates: path.join(ROOT, 'public', 'js', 'templates.js'),
  seo: path.join(ROOT, 'src', 'server', 'seo.js'),
  editorialTests: path.join(ROOT, 'tests', 'editorial-pages.test.mjs'),
});

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function wordCount(value) {
  if (Array.isArray(value)) return value.reduce((sum, item) => sum + wordCount(item), 0);
  if (value && typeof value === 'object') return Object.values(value).reduce((sum, item) => sum + wordCount(item), 0);
  return typeof value === 'string' ? value.trim().split(/\s+/).filter(Boolean).length : 0;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`));
}

function validSlug(value) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(value || ''));
}

export function validateEntry(entry, fileName = 'content entry') {
  assert(entry && typeof entry === 'object', `${fileName}: root must be an object`);
  assert(entry.version === 1, `${fileName}: version must be 1`);
  assert(isIsoDate(entry.date), `${fileName}: date must be YYYY-MM-DD`);

  const { article, tutorial, template } = entry;
  assert(article && tutorial && template, `${fileName}: article, tutorial and template are required`);
  assert(validSlug(article.slug), `${fileName}: invalid article slug`);
  assert(validSlug(tutorial.slug), `${fileName}: invalid tutorial slug`);
  assert(validSlug(template.id), `${fileName}: invalid template id`);
  assert(article.slug !== tutorial.slug, `${fileName}: article and tutorial slugs must differ`);

  assert(typeof article.title === 'string' && article.title.length >= 35 && article.title.length <= 100, `${fileName}: article title length is invalid`);
  assert(typeof article.description === 'string' && article.description.length >= 90 && article.description.length <= 190, `${fileName}: article description length is invalid`);
  assert(Array.isArray(article.keywords) && article.keywords.length >= 3, `${fileName}: article keywords are required`);
  assert(Array.isArray(article.sections) && article.sections.length >= 5, `${fileName}: article needs at least 5 sections`);
  assert(Array.isArray(article.takeaways) && article.takeaways.length >= 3, `${fileName}: article takeaways are required`);
  assert(isIsoDate(article.published) && isIsoDate(article.updated), `${fileName}: article dates are invalid`);
  assert(wordCount(article) >= 700, `${fileName}: article must contain at least 700 words`);

  assert(typeof tutorial.title === 'string' && tutorial.title.length >= 35 && tutorial.title.length <= 110, `${fileName}: tutorial title length is invalid`);
  assert(typeof tutorial.description === 'string' && tutorial.description.length >= 90 && tutorial.description.length <= 190, `${fileName}: tutorial description length is invalid`);
  assert(Array.isArray(tutorial.sections) && tutorial.sections.length >= 7, `${fileName}: tutorial needs at least 7 sections`);
  assert(Array.isArray(tutorial.faq) && tutorial.faq.length >= 3, `${fileName}: tutorial FAQ is required`);
  assert(isIsoDate(tutorial.published) && isIsoDate(tutorial.updated), `${fileName}: tutorial dates are invalid`);
  assert(wordCount(tutorial) >= 900, `${fileName}: tutorial must contain at least 900 words`);

  assert(typeof template.title === 'string' && template.title.length >= 8, `${fileName}: template title is required`);
  assert(typeof template.description === 'string' && template.description.length >= 30, `${fileName}: template description is too short`);
  assert(typeof template.keywords === 'string' && template.keywords.split(/\s+/).length >= 5, `${fileName}: template keywords are required`);
  assert(typeof template.code === 'string' && template.code.trim().length >= 80, `${fileName}: template code is too short`);

  const allCode = [
    template.code,
    ...article.sections.map((section) => section.code).filter(Boolean),
    ...tutorial.sections.map((section) => section.code).filter(Boolean),
  ];
  assert(allCode.every((code) => !/<script\b/i.test(code)), `${fileName}: script tags are not allowed in code examples`);
  assert(!/رتبه\s*(یک|۱)|تضمین\s*رتبه|تضمین\s*سئو/i.test(JSON.stringify(entry)), `${fileName}: ranking guarantees are not allowed`);

  return entry;
}

function indentObject(value, spaces = 2) {
  const pad = ' '.repeat(spaces);
  return JSON.stringify(value, null, 2).split('\n').map((line) => `${pad}${line}`).join('\n');
}

export function insertObjectAfterMarker(source, marker, value, identityPattern) {
  if (identityPattern.test(source)) return source;
  const index = source.indexOf(marker);
  assert(index >= 0, `publisher marker not found: ${marker}`);
  const insertAt = index + marker.length;
  return `${source.slice(0, insertAt)}\n${indentObject(value)},${source.slice(insertAt)}`;
}

function ensurePersianDateHelper(source) {
  if (source.includes('function formatPersianDate(')) return source;
  const marker = 'function escapeHtml(value) {';
  const helper = `function formatPersianDate(value) {
  const date = new Date(\`\${String(value || UPDATED)}T00:00:00.000Z\`);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('fa-IR', {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(date);
}

`;
  assert(source.includes(marker), 'date helper insertion marker not found');
  return source.replace(marker, `${helper}${marker}`);
}

function ensureDynamicVisibleDates(articleSource, tutorialSource) {
  let articles = ensurePersianDateHelper(articleSource);
  let tutorials = ensurePersianDateHelper(tutorialSource);

  articles = articles.replace(
    '<span>انتشار و بازبینی: ۲۴ تیر ۱۴۰۵</span>',
    '<span>انتشار و بازبینی: ${formatPersianDate(article.updated || article.published)}</span>',
  );
  tutorials = tutorials.replace(
    '<span>به‌روزرسانی ۲۴ تیر ۱۴۰۵</span>',
    '<span>به‌روزرسانی ${formatPersianDate(article.updated || article.published)}</span>',
  );
  return { articles, tutorials };
}

function ensureRelatedLearnTitle(source, slug, title) {
  const existing = new RegExp(`['"]${escapeRegExp(slug)}['"]\\s*:`);
  if (existing.test(source)) return source;
  const marker = "    'architecture-diagram-mermaid': 'آموزش نمودار معماری',";
  assert(source.includes(marker), 'related learn title marker not found');
  const safeSlug = slug.replace(/'/g, "\\'");
  const safeTitle = title.replace(/'/g, "\\'");
  return source.replace(marker, `${marker}\n    '${safeSlug}': '${safeTitle}',`);
}

function ensureExpandableEditorialCount(source) {
  return source.replace(
    "assert.equal(await page.$$eval('.guide-card', (nodes) => nodes.length), 8);",
    "assert.ok(await page.$$eval('.guide-card', (nodes) => nodes.length) >= 8);",
  );
}

function ensureTemplateStructuredData(source, title) {
  if (source.includes(`"${title}"`) || source.includes(`'${title}'`)) return source;
  const marker = "          'گانت انتشار', 'نقشه ذهنی محتوا', 'معماری ابری', 'سفر کاربر',";
  assert(source.includes(marker), 'template structured-data marker not found');
  return source.replace(marker, `${marker}\n          ${JSON.stringify(title)},`);
}

export function syncContentText(files, entries) {
  let { articles, tutorials, templates, seo, editorialTests = '' } = files;
  ({ articles, tutorials } = ensureDynamicVisibleDates(articles, tutorials));

  for (const entry of entries) {
    const articlePattern = new RegExp(`[\"']?slug[\"']?\\s*:\\s*[\"']${escapeRegExp(entry.article.slug)}[\"']`);
    articles = insertObjectAfterMarker(
      articles,
      'export const EDITORIAL_ARTICLES = [',
      entry.article,
      articlePattern,
    );

    const tutorialPattern = new RegExp(`[\"']?slug[\"']?\\s*:\\s*[\"']${escapeRegExp(entry.tutorial.slug)}[\"']`);
    tutorials = insertObjectAfterMarker(
      tutorials,
      'export const LEARN_ARTICLES = [',
      entry.tutorial,
      tutorialPattern,
    );

    const templatePattern = new RegExp(`[\"']?id[\"']?\\s*:\\s*[\"']${escapeRegExp(entry.template.id)}[\"']`);
    templates = insertObjectAfterMarker(
      templates,
      'const templates = [',
      entry.template,
      templatePattern,
    );

    articles = ensureRelatedLearnTitle(
      articles,
      entry.tutorial.slug,
      entry.relatedLearnTitle || entry.tutorial.shortTitle,
    );
    seo = ensureTemplateStructuredData(seo, entry.template.title);
  }

  editorialTests = ensureExpandableEditorialCount(editorialTests);
  return { articles, tutorials, templates, seo, editorialTests };
}

async function loadEntries() {
  const names = (await fs.readdir(CONTENT_DIR))
    .filter((name) => name.endsWith('.json'))
    .sort();
  const entries = [];
  const articleSlugs = new Set();
  const tutorialSlugs = new Set();
  const templateIds = new Set();

  for (const name of names) {
    const fullPath = path.join(CONTENT_DIR, name);
    const entry = validateEntry(JSON.parse(await fs.readFile(fullPath, 'utf8')), name);
    assert(!articleSlugs.has(entry.article.slug), `${name}: duplicate article slug`);
    assert(!tutorialSlugs.has(entry.tutorial.slug), `${name}: duplicate tutorial slug`);
    assert(!templateIds.has(entry.template.id), `${name}: duplicate template id`);
    articleSlugs.add(entry.article.slug);
    tutorialSlugs.add(entry.tutorial.slug);
    templateIds.add(entry.template.id);
    entries.push(entry);
  }
  assert(entries.length > 0, 'no daily content entries found');
  return entries;
}

async function readTargets() {
  return {
    articles: await fs.readFile(TARGETS.articles, 'utf8'),
    tutorials: await fs.readFile(TARGETS.tutorials, 'utf8'),
    templates: await fs.readFile(TARGETS.templates, 'utf8'),
    seo: await fs.readFile(TARGETS.seo, 'utf8'),
    editorialTests: await fs.readFile(TARGETS.editorialTests, 'utf8'),
  };
}

async function writeIfChanged(filePath, before, after) {
  if (before === after) return false;
  await fs.writeFile(filePath, after, 'utf8');
  return true;
}

export async function publishDailyContent() {
  const entries = await loadEntries();
  const before = await readTargets();
  const after = syncContentText(before, entries);
  const changed = [];

  if (await writeIfChanged(TARGETS.articles, before.articles, after.articles)) changed.push(path.relative(ROOT, TARGETS.articles));
  if (await writeIfChanged(TARGETS.tutorials, before.tutorials, after.tutorials)) changed.push(path.relative(ROOT, TARGETS.tutorials));
  if (await writeIfChanged(TARGETS.templates, before.templates, after.templates)) changed.push(path.relative(ROOT, TARGETS.templates));
  if (await writeIfChanged(TARGETS.seo, before.seo, after.seo)) changed.push(path.relative(ROOT, TARGETS.seo));
  if (await writeIfChanged(TARGETS.editorialTests, before.editorialTests, after.editorialTests)) changed.push(path.relative(ROOT, TARGETS.editorialTests));

  return {
    entries: entries.map((entry) => ({
      date: entry.date,
      article: `/articles/${entry.article.slug}`,
      tutorial: `/learn/${entry.tutorial.slug}`,
      template: entry.template.id,
    })),
    changed,
  };
}

async function main() {
  const result = await publishDailyContent();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.stack || error.message || String(error));
    process.exitCode = 1;
  });
}
