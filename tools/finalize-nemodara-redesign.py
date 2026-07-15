#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path.cwd()

learn_path = ROOT / 'src/server/learn-content.js'
learn = learn_path.read_text(encoding='utf-8')
learn = learn.replace("const UPDATED = '2026-07-13';", "const UPDATED = '2026-07-15';", 1)
marker = 'function renderSection(section, index) {'
if marker not in learn:
    raise SystemExit('learn-content render marker not found')
prefix = learn.split(marker, 1)[0]
new_tail = r'''function renderSection(section, index) {
  const paragraphs = (section.paragraphs || []).map((paragraph) => `<p>${inlineMarkdown(paragraph)}</p>`).join('');
  const bullets = section.bullets?.length
    ? `<ul>${section.bullets.map((bullet) => `<li>${inlineMarkdown(bullet)}</li>`).join('')}</ul>`
    : '';
  const code = section.code
    ? `<div class="code-example"><div class="code-example-head"><span>${escapeHtml(section.codeLabel || `example-${index + 1}.mmd`)}</span><button type="button" data-copy-target="code-${index}">کپی کد</button><a data-open-target="code-${index}" href="/editor">بازکردن در ادیتور</a></div><pre><code id="code-${index}">${escapeHtml(section.code)}</code></pre><div class="code-practice"><span>تمرین کوتاه: یکی از نام‌ها یا مسیرها را تغییر بده و نتیجه را ببین.</span><a data-open-target="code-${index}" href="/editor">آزمایش این مثال ←</a></div></div>`
    : '';
  const note = section.note ? `<div class="note"><strong>نکتهٔ عملی:</strong> ${inlineMarkdown(section.note)}</div>` : '';
  return `<section class="article-section" id="${escapeHtml(section.id)}"><header class="article-section-header"><span class="article-section-number">${String(index + 1).padStart(2, '0')}</span><h2>${escapeHtml(section.title)}</h2></header>${paragraphs}${bullets}${code}${note}</section>`;
}

function relatedArticles(currentSlug) {
  const index = LEARN_ARTICLES.findIndex((article) => article.slug === currentSlug);
  const candidates = [
    LEARN_ARTICLES[index - 1],
    LEARN_ARTICLES[index + 1],
    LEARN_ARTICLES[index + 2],
    LEARN_ARTICLES[index - 2],
  ].filter(Boolean);
  return [...new Map(candidates.map((article) => [article.slug, article])).values()].slice(0, 2);
}

export function getLearnArticle(slug) {
  return ARTICLE_MAP.get(String(slug || '')) || null;
}

export function learnSitemapEntries() {
  return LEARN_ARTICLES.map((article) => ({
    path: `/learn/${article.slug}`,
    updated: article.updated || UPDATED,
    priority: 0.82,
  }));
}

export function renderLearnArticle(slug) {
  const article = getLearnArticle(slug);
  if (!article) return null;
  const links = articleLinks(article.slug);
  const related = relatedArticles(article.slug);
  const toc = article.sections.map((section) => `<a href="#${escapeHtml(section.id)}">${escapeHtml(section.title)}</a>`).join('');
  const faq = article.faq.map(([question, answer]) => `<details><summary>${escapeHtml(question)}</summary><p>${escapeHtml(answer)}</p></details>`).join('');
  const outcomes = article.sections.slice(0, 4).map((section) => `<li>${escapeHtml(section.title)}</li>`).join('');
  const navigation = `<nav class="doc-next" aria-label="درس‌های قبلی و بعدی">${links.previous ? `<a href="/learn/${links.previous.slug}"><small>درس قبلی</small>${escapeHtml(links.previous.shortTitle)}</a>` : '<span></span>'}${links.next ? `<a href="/learn/${links.next.slug}"><small>درس بعدی</small>${escapeHtml(links.next.shortTitle)}</a>` : `<a href="/templates"><small>مرحلهٔ بعد</small>قالب‌های آماده</a>`}</nav>`;
  const relatedCards = related.map((item) => `<a class="related-card" href="/learn/${item.slug}"><small>${escapeHtml(item.level)}</small><strong>${escapeHtml(item.shortTitle)}</strong><span>${item.minutes.toLocaleString('fa-IR')} دقیقه مطالعه</span></a>`).join('');

  return `<!doctype html>
<html lang="fa" dir="rtl" data-theme="light">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="theme-color" content="#f5f3ed" />
  <title>${escapeHtml(article.title)} | نمودارا</title>
  <meta name="description" content="${escapeHtml(article.description)}" />
  <link rel="icon" href="/logo.svg" type="image/svg+xml" />
  <link rel="stylesheet" href="/css/landing.css?v=%V%" />
  <link rel="stylesheet" href="/css/landing-utilities.css?v=%V%" />
  <link rel="stylesheet" href="/css/docs.css?v=%V%" />
  <link rel="stylesheet" href="/css/ads.css?v=%V%" />
</head>
<body class="docs-body article-page">
  <a class="skip-link" href="#article-main">رفتن به متن مقاله</a>
  <div class="article-progress" aria-hidden="true"><i id="article-progress"></i></div>
  <header class="docs-header">
    <a class="brand" href="/" aria-label="نمودارا، صفحهٔ اصلی"><img class="brand-mark" src="/logo.svg" width="38" height="38" alt="" /><span class="brand-copy"><strong>نمودارا</strong><small>مرجع فارسی Mermaid</small></span></a>
    <nav aria-label="ناوبری آموزش"><a href="/">خانه</a><a class="is-current" href="/learn">آموزش</a><a href="/templates">قالب‌ها</a></nav>
    <div class="header-actions"><button id="theme-toggle" class="icon-button" type="button" aria-label="تغییر پوسته">◐</button><a class="button button-small" href="/editor">بازکردن ادیتور</a></div>
  </header>

  <aside class="ad-slot ad-slot--compact" data-ad-slot="learnTop" hidden aria-label="تبلیغات"><span class="ad-slot__label">تبلیغات</span><a class="ad-slot__privacy" href="/privacy#advertising">درباره تبلیغات</a><div class="ad-slot__mount" data-ad-mount></div></aside>

  <main id="article-main" class="article-shell">
    <nav class="breadcrumbs" aria-label="مسیر مقاله"><a href="/">خانه</a><span>/</span><a href="/learn">آموزش Mermaid</a><span>/</span><span>${escapeHtml(article.shortTitle)}</span></nav>
    <article>
      <header class="article-hero">
        <p class="eyebrow">راهنمای عملی ${escapeHtml(article.shortTitle)}</p>
        <h1>${escapeHtml(article.title)}</h1>
        <p class="article-deck">${escapeHtml(article.intro)}</p>
        <div class="article-meta"><span>${escapeHtml(article.level)}</span><span>${article.minutes.toLocaleString('fa-IR')} دقیقه مطالعه</span><span>به‌روزرسانی ۲۴ تیر ۱۴۰۵</span><span>مثال‌های قابل ویرایش</span></div>
        <div class="article-actions"><a class="button button-primary" href="/editor">تمرین در ادیتور</a><a class="text-link" href="/learn">بازگشت به مسیر آموزش</a></div>
      </header>

      <div class="article-layout">
        <div class="article-main">
          <details class="mobile-toc"><summary>فهرست این راهنما</summary><nav data-article-toc>${toc}<a href="#faq">پرسش‌های رایج</a></nav></details>
          <section class="article-summary"><span>در پایان این راهنما</span><h2>می‌توانی این بخش‌ها را با اطمینان بسازی</h2><ul>${outcomes}</ul></section>
          ${article.sections.map(renderSection).join('')}
          <section class="article-section" id="faq"><header class="article-section-header"><span class="article-section-number">؟</span><h2>پرسش‌های رایج</h2></header><div class="article-faq">${faq}</div></section>
          ${relatedCards ? `<section class="article-related"><h2>برای ادامهٔ مسیر</h2><div class="related-grid">${relatedCards}</div></section>` : ''}
          ${navigation}
          <aside class="ad-slot ad-slot--compact" data-ad-slot="learnInline" hidden aria-label="تبلیغات"><span class="ad-slot__label">تبلیغات</span><a class="ad-slot__privacy" href="/privacy#advertising">درباره تبلیغات</a><div class="ad-slot__mount" data-ad-mount></div></aside>
        </div>
        <aside class="article-aside"><div class="article-aside-box"><h2>در این راهنما</h2><nav data-article-toc>${toc}<a href="#faq">پرسش‌های رایج</a></nav><a class="button button-secondary sidebar-cta" href="/editor">ساخت نمودار</a></div></aside>
      </div>
    </article>
  </main>

  <footer class="docs-footer"><div><strong>نمودارا</strong><span>آموزش و ابزار رایگان Mermaid برای فارسی‌زبان‌ها</span></div><nav><a href="/learn">همهٔ آموزش‌ها</a><a href="/templates">قالب‌ها</a><a href="/privacy">حریم خصوصی</a><a href="https://github.com/Emad211/mermaid-studio" target="_blank" rel="noreferrer">GitHub</a></nav></footer>
  <script type="module" src="/js/docs.js?v=%V%"></script>
  <script type="module" src="/js/ads.js?v=%V%"></script>
</body>
</html>`;
}
'''
learn_path.write_text(prefix + new_tail, encoding='utf-8')

seo_path = ROOT / 'src/server/seo.js'
seo = seo_path.read_text(encoding='utf-8')
replacements = {
    "const DEFAULT_UPDATED = '2026-07-13';": "const DEFAULT_UPDATED = '2026-07-15';",
    "title: 'Mermaid Studio | ادیتور فارسی ساخت نمودار با کد',": "title: 'نمودارا | ادیتور فارسی Mermaid و ساخت نمودار با کد',",
    "description: 'ادیتور رایگان و فارسی Mermaid برای ساخت فلوچارت، Sequence، ERD، Gantt و UML با پیش‌نمایش زنده و خروجی SVG، PNG و PDF.',": "description: 'نمودارا، ادیتور رایگان و فارسی Mermaid برای ساخت فلوچارت، Sequence، ERD، گانت و UML با پیش‌نمایش زنده و خروجی SVG، PNG و PDF.',",
    "title: 'قالب‌های رایگان Mermaid فارسی | فلوچارت، ERD، UML و گانت',": "title: 'قالب‌های رایگان Mermaid فارسی | نمودارا',",
    "title: 'آموزش Mermaid به فارسی؛ از صفر تا نمودار حرفه‌ای',": "title: 'آموزش Mermaid به فارسی؛ مثال‌محور و رایگان | نمودارا',",
    "title: 'سیاست حریم خصوصی | Mermaid Studio',": "title: 'سیاست حریم خصوصی | نمودارا',",
    "description: 'سیاست حریم خصوصی، تحلیل first-party، تبلیغات و پردازش محلی نمودارها در Mermaid Studio.',": "description: 'سیاست حریم خصوصی، تحلیل first-party، تبلیغات و پردازش محلی نمودارها در نمودارا.',",
    "title: 'شرایط استفاده | Mermaid Studio',": "title: 'شرایط استفاده | نمودارا',",
    "description: 'شرایط استفاده از نسخه رایگان و عمومی Mermaid Studio و محدودیت‌های فنی سرویس.',": "description: 'شرایط استفاده از نسخهٔ رایگان و عمومی نمودارا و محدودیت‌های فنی سرویس.',",
    "title: 'ادیتور آنلاین Mermaid فارسی | Mermaid Studio',": "title: 'ادیتور آنلاین Mermaid فارسی | نمودارا',",
    "siteName: String(env.SITE_NAME || 'Mermaid Studio').trim().slice(0, 80) || 'Mermaid Studio',": "siteName: String(env.SITE_NAME || 'نمودارا').trim().slice(0, 80) || 'نمودارا',",
    "authorName: String(env.SEO_AUTHOR_NAME || 'تیم Mermaid Studio').trim().slice(0, 100),": "authorName: String(env.SEO_AUTHOR_NAME || 'تیم تحریریه نمودارا').trim().slice(0, 100),",
}
for old, new in replacements.items():
    if old not in seo:
        raise SystemExit(f'SEO replacement not found: {old}')
    seo = seo.replace(old, new, 1)
seo_path.write_text(seo, encoding='utf-8')

package_path = ROOT / 'package.json'
package = json.loads(package_path.read_text(encoding='utf-8'))
package['version'] = '1.6.0'
package['description'] = 'Nemodara: a Persian-first Mermaid editor with an editorial learning hub, privacy-first analytics and deep technical SEO.'
product = package['scripts']['test:product']
if 'tests/editorial-pages.test.mjs' not in product:
    product = product.replace('tests/admin-browser.test.mjs', 'tests/admin-browser.test.mjs tests/editorial-pages.test.mjs')
package['scripts']['test:product'] = product
package_path.write_text(json.dumps(package, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

lock_path = ROOT / 'package-lock.json'
lock = json.loads(lock_path.read_text(encoding='utf-8'))
lock['version'] = '1.6.0'
if '' in lock.get('packages', {}):
    lock['packages']['']['version'] = '1.6.0'
lock_path.write_text(json.dumps(lock, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

print('Nemodara article templates, SEO metadata and version finalized.')
