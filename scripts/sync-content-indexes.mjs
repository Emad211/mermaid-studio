#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEntries } from './publish-daily-content.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const TARGETS = Object.freeze({
  learn: path.join(ROOT, 'public', 'learn.html'),
  templates: path.join(ROOT, 'public', 'templates.html'),
  templateRegistry: path.join(ROOT, 'public', 'js', 'templates.js'),
});

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function insertAfterMarker(source, marker, identity, html) {
  if (source.includes(identity)) return source;
  const index = source.indexOf(marker);
  if (index < 0) throw new Error(`content index marker not found: ${marker}`);
  const at = index + marker.length;
  return `${source.slice(0, at)}\n${html}${source.slice(at)}`;
}

function upsertAfterMarker(source, marker, identity, html, pattern) {
  if (!source.includes(identity)) return insertAfterMarker(source, marker, identity, html);
  if (!pattern.test(source)) throw new Error(`content index entry could not be replaced: ${identity}`);
  return source.replace(pattern, html);
}

function editorUrl(code) {
  const state = { code, theme: 'default', layout: 'dagre', background: 'white', config: '', css: '' };
  const token = Buffer.from(JSON.stringify(state), 'utf8').toString('base64url');
  return `/editor#code=${encodeURIComponent(`u:${token}`)}`;
}

function tutorialCard(entry) {
  const tutorial = entry.tutorial;
  const summary = tutorial.intro.length > 150 ? `${tutorial.intro.slice(0, 147).trim()}…` : tutorial.intro;
  return `          <a class="guide-card" data-tutorial-slug="${escapeHtml(tutorial.slug)}" href="/learn/${escapeHtml(tutorial.slug)}"><span class="guide-index">جدید</span><div><small>${escapeHtml(entry.cluster?.intent || 'راهنمای عملی')}</small><h3>${escapeHtml(tutorial.shortTitle)}</h3><p>${escapeHtml(summary)}</p></div><footer><span>${escapeHtml(tutorial.minutes.toLocaleString('fa-IR'))} دقیقه</span><span>${escapeHtml(tutorial.level)}</span></footer></a>`;
}

function tutorialCardPattern(slug) {
  return new RegExp(`[ \\t]*<a class="guide-card" data-tutorial-slug="${escapeRegExp(escapeHtml(slug))}"[\\s\\S]*?<\\/a>`);
}

function tutorialPickerRow(entry) {
  const tutorial = entry.tutorial;
  return `          <div data-tutorial-picker="${escapeHtml(tutorial.slug)}" role="row"><strong role="cell">${escapeHtml(entry.cluster?.name || tutorial.shortTitle)}</strong><span role="cell">${escapeHtml(tutorial.shortTitle)}</span><a role="cell" href="/learn/${escapeHtml(tutorial.slug)}">راهنما</a></div>`;
}

function tutorialPickerPattern(slug) {
  return new RegExp(`[ \\t]*<div data-tutorial-picker="${escapeRegExp(escapeHtml(slug))}" role="row">[\\s\\S]*?<\\/div>`);
}

function templateCard(entry) {
  const template = entry.template;
  const tutorialPath = `/learn/${entry.tutorial.slug}`;
  const articlePath = `/articles/${entry.article.slug}`;
  return `        <article id="template-${escapeHtml(template.id)}" class="template-card" data-id="${escapeHtml(template.id)}" data-template-id="${escapeHtml(template.id)}">
          <div class="template-card-head"><div><h3>${escapeHtml(template.title)}</h3><p>${escapeHtml(template.description)}</p></div><span class="template-badge">${escapeHtml(template.badge)}</span></div>
          <pre class="template-code"><code>${escapeHtml(template.code)}</code></pre>
          <nav class="template-related" aria-label="مطالب مرتبط"><a href="${escapeHtml(tutorialPath)}">آموزش مرتبط</a><a href="${escapeHtml(articlePath)}">مقالهٔ مرتبط</a></nav>
          <div class="template-actions"><a class="button button-primary" href="${escapeHtml(editorUrl(template.code))}">ویرایش قالب</a><a class="button button-secondary" href="${escapeHtml(tutorialPath)}">آموزش</a></div>
        </article>`;
}

function templateCardPattern(id) {
  return new RegExp(`[ \\t]*<article[^>]*data-template-id="${escapeRegExp(escapeHtml(id))}"[^>]*>[\\s\\S]*?<\\/article>`);
}

function registryTemplateCount(source) {
  const ids = [...source.matchAll(/(?:^|[,{]\s*)["']?id["']?\s*:\s*["']([a-z0-9-]+)["']/gm)].map((match) => match[1]);
  return new Set(ids).size;
}

export function syncIndexText({ learn, templates, templateRegistry }, entries) {
  let nextLearn = learn;
  let nextTemplates = templates;

  for (const entry of entries) {
    nextLearn = upsertAfterMarker(
      nextLearn,
      '<!-- DAILY_TUTORIAL_CARDS -->',
      `data-tutorial-slug="${entry.tutorial.slug}"`,
      tutorialCard(entry),
      tutorialCardPattern(entry.tutorial.slug),
    );
    nextLearn = upsertAfterMarker(
      nextLearn,
      '<!-- DAILY_TUTORIAL_PICKER_ROWS -->',
      `data-tutorial-picker="${entry.tutorial.slug}"`,
      tutorialPickerRow(entry),
      tutorialPickerPattern(entry.tutorial.slug),
    );
    nextTemplates = upsertAfterMarker(
      nextTemplates,
      '<!-- DAILY_TEMPLATE_CARDS -->',
      `data-template-id="${entry.template.id}"`,
      templateCard(entry),
      templateCardPattern(entry.template.id),
    );
  }

  const guideCount = (nextLearn.match(/class="guide-card"/g) || []).length;
  nextLearn = nextLearn.replace(/<dt data-guide-count>[^<]*<\/dt>/, `<dt data-guide-count>${guideCount.toLocaleString('fa-IR')}</dt>`);

  const templateCount = registryTemplateCount(templateRegistry);
  if (templateCount) {
    nextTemplates = nextTemplates.replace(/<span id="template-count" class="template-count" aria-live="polite">[^<]*<\/span>/, `<span id="template-count" class="template-count" aria-live="polite">${templateCount.toLocaleString('fa-IR')} قالب</span>`);
  }

  return { learn: nextLearn, templates: nextTemplates };
}

async function writeIfChanged(filePath, before, after) {
  if (before === after) return false;
  await fs.writeFile(filePath, after, 'utf8');
  return true;
}

export async function syncContentIndexes() {
  const [entries, learn, templates, templateRegistry] = await Promise.all([
    loadEntries(),
    fs.readFile(TARGETS.learn, 'utf8'),
    fs.readFile(TARGETS.templates, 'utf8'),
    fs.readFile(TARGETS.templateRegistry, 'utf8'),
  ]);
  const next = syncIndexText({ learn, templates, templateRegistry }, entries);
  const changed = [];
  if (await writeIfChanged(TARGETS.learn, learn, next.learn)) changed.push(path.relative(ROOT, TARGETS.learn));
  if (await writeIfChanged(TARGETS.templates, templates, next.templates)) changed.push(path.relative(ROOT, TARGETS.templates));
  return { entries: entries.length, changed };
}

async function main() {
  process.stdout.write(`${JSON.stringify(await syncContentIndexes(), null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.stack || error.message || String(error));
    process.exitCode = 1;
  });
}
