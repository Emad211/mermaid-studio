import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../src/server/app.js';
import { LEARN_ARTICLES, renderLearnArticle } from '../src/server/learn-content.js';
import { enhanceHtml, robotsTxt, seoConfig, sitemapXml } from '../src/server/seo.js';

const env = {
  NODE_ENV: 'test',
  SITE_URL: 'https://diagram.example.com',
  SITE_NAME: 'Mermaid Studio',
  SEO_LAST_MODIFIED: '2026-07-13',
  ANALYTICS_ENABLED: 'false',
};

test('SEO enhancer emits unique canonical metadata and structured data', () => {
  const config = seoConfig(env);
  const source = '<!doctype html><html lang="fa"><head><title>Old</title><meta name="description" content="old"></head><body></body></html>';
  const root = enhanceHtml(source, '/', config);
  assert.match(root.html, /<link rel="canonical" href="https:\/\/diagram\.example\.com\/"/);
  assert.match(root.html, /SoftwareApplication/);
  assert.match(root.html, /"price":"0"/);
  assert.match(root.html, /twitter:card/);

  const article = enhanceHtml(renderLearnArticle('flowchart-mermaid'), '/learn/flowchart-mermaid', config);
  assert.match(article.html, /TechArticle/);
  assert.match(article.html, /BreadcrumbList/);
  assert.match(article.html, /FAQPage/);
  assert.match(article.html, /https:\/\/diagram\.example\.com\/learn\/flowchart-mermaid/);
  assert.doesNotMatch(article.html, /<title>Old<\/title>/);
});

test('sitemap and robots expose canonical content cluster', () => {
  const config = seoConfig(env);
  const sitemap = sitemapXml(config);
  assert.match(sitemap, /https:\/\/diagram\.example\.com\/learn\/flowchart-mermaid/);
  assert.match(sitemap, /https:\/\/diagram\.example\.com\/templates/);
  assert.doesNotMatch(sitemap, /\/editor<\/loc>/);
  assert.equal((sitemap.match(/<url>/g) || []).length, 3 + 2 + LEARN_ARTICLES.length);

  const robots = robotsTxt(config);
  assert.match(robots, /Disallow: \/admin\//);
  assert.match(robots, /Sitemap: https:\/\/diagram\.example\.com\/sitemap\.xml/);
});

test('all learning articles have substantial unique content and useful internal links', () => {
  assert.ok(LEARN_ARTICLES.length >= 8);
  const titles = new Set();
  for (const article of LEARN_ARTICLES) {
    assert.ok(article.title.length >= 35, article.slug);
    assert.ok(article.description.length >= 90, article.slug);
    assert.ok(article.sections.length >= 3, article.slug);
    assert.ok(article.faq.length >= 3, article.slug);
    assert.ok(!titles.has(article.title), `duplicate title: ${article.title}`);
    titles.add(article.title);
    const html = renderLearnArticle(article.slug);
    assert.match(html, /href="\/learn"/);
    assert.match(html, /data-open-target/);
    assert.match(html, /href="\/learn\/[a-z0-9-]+"/);
    for (const related of article.related || []) {
      assert.match(html, new RegExp(`/learn/${related.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    }
    assert.ok(html.length > 5000, `${article.slug} is too thin`);
  }
});

test('HTTP routes canonicalize duplicates and serve SEO files', async (t) => {
  const server = await startServer({ port: 0, host: '127.0.0.1', environment: env, logger: { error() {} } });
  t.after(() => server.close());

  const duplicate = await fetch(`${server.url}/examples`, { redirect: 'manual' });
  assert.equal(duplicate.status, 301);
  assert.equal(duplicate.headers.get('location'), '/templates');

  const article = await fetch(`${server.url}/learn/sequence-diagram-mermaid`);
  assert.equal(article.status, 200);
  const html = await article.text();
  assert.match(html, /rel="canonical" href="https:\/\/diagram\.example\.com\/learn\/sequence-diagram-mermaid"/);
  assert.match(html, /application\/ld\+json/);
  assert.match(article.headers.get('link') || '', /rel="canonical"/);

  const sitemap = await fetch(`${server.url}/sitemap.xml`);
  assert.equal(sitemap.status, 200);
  assert.match(sitemap.headers.get('content-type') || '', /xml/);

  const missing = await fetch(`${server.url}/does-not-exist`);
  assert.equal(missing.status, 404);
  assert.match(missing.headers.get('x-robots-tag') || '', /noindex/);
});
