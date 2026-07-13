import { LEARN_ARTICLES } from './learn-content.js';

const INDEXABLE_ROUTES = [
  '/',
  '/templates',
  '/learn',
  ...LEARN_ARTICLES.map((article) => `/learn/${article.slug}`),
  '/privacy',
  '/terms',
];

const NOINDEX_ROUTES = ['/editor', '/headless', '/admin/analytics'];
const LEGACY_REDIRECTS = {
  '/fa': '/',
  '/examples': '/templates',
  '/templates/': '/templates',
  '/learn/': '/learn',
  '/landing.html': '/',
  '/templates.html': '/templates',
  '/learn.html': '/learn',
  '/privacy.html': '/privacy',
  '/terms.html': '/terms',
};

function text(value) {
  return String(value ?? '');
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function attribute(html, tag, name, value, property = 'name') {
  const pattern = new RegExp(`<${tag}\\b(?=[^>]*\\b${property}=["']${escapeRegex(value)}["'])[^>]*\\b${name}=["']([^"']*)["'][^>]*>`, 'i');
  const reverse = new RegExp(`<${tag}\\b(?=[^>]*\\b${name}=["']([^"']*)["'])[^>]*\\b${property}=["']${escapeRegex(value)}["'][^>]*>`, 'i');
  return pattern.exec(html)?.[1] || reverse.exec(html)?.[1] || '';
}

function tagText(html, tag) {
  return new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i').exec(html)?.[1]?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || '';
}

function allTagText(html, tag) {
  return [...html.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi'))]
    .map((match) => match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

function linkCanonical(html) {
  const forward = /<link\b(?=[^>]*\brel=["']canonical["'])[^>]*\bhref=["']([^"']+)["'][^>]*>/i;
  const reverse = /<link\b(?=[^>]*\bhref=["']([^"']+)["'])[^>]*\brel=["']canonical["'][^>]*>/i;
  return forward.exec(html)?.[1] || reverse.exec(html)?.[1] || '';
}

function robotsMeta(html) {
  return attribute(html, 'meta', 'content', 'robots') || '';
}

function htmlLanguage(html) {
  return /<html\b[^>]*\blang=["']([^"']+)["']/i.exec(html)?.[1] || '';
}

function internalLinks(html) {
  return [...html.matchAll(/<a\b[^>]*\bhref=["']([^"'#]+)["'][^>]*>/gi)]
    .map((match) => match[1])
    .filter((href) => href.startsWith('/'));
}

function imageStats(html) {
  const images = [...html.matchAll(/<img\b([^>]*)>/gi)];
  let missingAlt = 0;
  for (const [, attrs] of images) {
    if (!/\balt=["'][^"']*["']/i.test(attrs)) missingAlt += 1;
  }
  return { count: images.length, missingAlt };
}

function visibleWordCount(html) {
  const cleaned = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z0-9#]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned ? cleaned.split(' ').length : 0;
}

function structuredData(html) {
  const blocks = [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const types = new Set();
  let valid = 0;
  let invalid = 0;
  for (const block of blocks) {
    try {
      const parsed = JSON.parse(block[1]);
      valid += 1;
      const visit = (value) => {
        if (!value || typeof value !== 'object') return;
        if (Array.isArray(value)) return value.forEach(visit);
        const type = value['@type'];
        if (Array.isArray(type)) type.forEach((item) => types.add(String(item)));
        else if (type) types.add(String(type));
        Object.values(value).forEach(visit);
      };
      visit(parsed);
    } catch {
      invalid += 1;
    }
  }
  return { blocks: blocks.length, valid, invalid, types: [...types].sort() };
}

function absolute(siteUrl, route) {
  if (!siteUrl) return '';
  return new URL(route, `${siteUrl.replace(/\/$/, '')}/`).href;
}

function check(key, label, status, weight, detail, fix = '') {
  return { key, label, status, weight, detail, fix };
}

function scoreChecks(checks) {
  let total = 0;
  let earned = 0;
  for (const item of checks) {
    if (!item.weight) continue;
    total += item.weight;
    if (item.status === 'pass') earned += item.weight;
    else if (item.status === 'warning') earned += item.weight * 0.5;
  }
  return total ? Math.round((earned / total) * 100) : 0;
}

function issueFrom(route, item) {
  if (!['fail', 'warning'].includes(item.status)) return null;
  return {
    severity: item.status === 'fail' ? 'critical' : 'warning',
    category: item.key,
    route,
    title: item.label,
    detail: item.detail,
    fix: item.fix,
  };
}

function grade(score) {
  if (score >= 95) return 'A+';
  if (score >= 90) return 'A';
  if (score >= 82) return 'B';
  if (score >= 70) return 'C';
  if (score >= 55) return 'D';
  return 'F';
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 8_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();
  const started = performance.now();
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return { response, responseMs: Math.round(performance.now() - started) };
  } finally {
    clearTimeout(timer);
  }
}

function minimumWords(route) {
  if (route.startsWith('/learn/')) return 450;
  if (route === '/learn') return 180;
  if (route === '/') return 140;
  if (route === '/templates') return 120;
  return 80;
}

async function auditPage({ origin, siteUrl, route, sitemapUrls, timeoutMs }) {
  const expectedCanonical = absolute(siteUrl, route);
  const checks = [];
  let html = '';
  let status = 0;
  let responseMs = 0;
  let bytes = 0;
  let responseHeaders = {};
  try {
    const result = await fetchWithTimeout(`${origin}${route}`, { redirect: 'manual', headers: { Accept: 'text/html' } }, timeoutMs);
    const response = result.response;
    responseMs = result.responseMs;
    status = response.status;
    html = await response.text();
    bytes = Buffer.byteLength(html);
    responseHeaders = {
      contentLanguage: response.headers.get('content-language') || '',
      xRobotsTag: response.headers.get('x-robots-tag') || '',
      canonicalLink: response.headers.get('link') || '',
      cacheControl: response.headers.get('cache-control') || '',
    };
  } catch (error) {
    checks.push(check('availability', 'دسترسی صفحه', 'fail', 20, `دریافت صفحه ناموفق بود: ${error.name === 'AbortError' ? 'timeout' : error.message}`, 'سلامت سرور و route را بررسی کنید.'));
    return { route, status, responseMs, bytes, score: 0, checks, title: '', description: '', canonical: '', robots: '', h1: [], wordCount: 0, links: 0, schema: { blocks: 0, valid: 0, invalid: 0, types: [] }, headers: responseHeaders };
  }

  const title = tagText(html, 'title');
  const description = attribute(html, 'meta', 'content', 'description');
  const canonical = linkCanonical(html);
  const robots = robotsMeta(html).toLowerCase();
  const h1 = allTagText(html, 'h1');
  const language = htmlLanguage(html).toLowerCase();
  const links = internalLinks(html);
  const images = imageStats(html);
  const schema = structuredData(html);
  const wordCount = visibleWordCount(html);
  const ogTitle = attribute(html, 'meta', 'content', 'og:title', 'property');
  const ogDescription = attribute(html, 'meta', 'content', 'og:description', 'property');
  const twitterCard = attribute(html, 'meta', 'content', 'twitter:card');

  checks.push(check('availability', 'صفحه با پاسخ ۲۰۰', status === 200 ? 'pass' : 'fail', 16, `HTTP ${status}`, 'Route و خطاهای سرور را اصلاح کنید.'));
  checks.push(check('canonical', 'Canonical یکتا و مطلق', canonical && canonical === expectedCanonical ? 'pass' : 'fail', 14, canonical ? `canonical: ${canonical}` : 'Canonical وجود ندارد.', `Canonical باید دقیقاً ${expectedCanonical || 'SITE_URL + route'} باشد.`));
  checks.push(check('indexability', 'صفحه قابل ایندکس', !robots.includes('noindex') && !responseHeaders.xRobotsTag.includes('noindex') ? 'pass' : 'fail', 12, robots || responseHeaders.xRobotsTag || 'index,follow', 'noindex را از صفحات محتوایی حذف کنید.'));
  checks.push(check('title', 'عنوان یکتا و توصیفی', title ? (title.length >= 25 && title.length <= 70 ? 'pass' : 'warning') : 'fail', 8, title ? `${title.length} نویسه` : 'Title وجود ندارد.', 'Title را دقیق، یکتا و متناسب با intent صفحه بنویسید؛ بازهٔ طول صرفاً راهنمای عملی است.'));
  checks.push(check('description', 'Meta description مناسب', description ? (description.length >= 80 && description.length <= 190 ? 'pass' : 'warning') : 'fail', 6, description ? `${description.length} نویسه` : 'Description وجود ندارد.', 'خلاصه‌ای یکتا و قانع‌کننده از محتوای واقعی صفحه بنویسید.'));
  checks.push(check('heading', 'یک H1 روشن', h1.length === 1 ? 'pass' : h1.length ? 'warning' : 'fail', 6, `${h1.length} تگ H1`, 'هر صفحه یک H1 اصلی و توصیفی داشته باشد.'));
  checks.push(check('language', 'زبان سند فارسی', language.startsWith('fa') ? 'pass' : 'warning', 3, language || 'lang تنظیم نشده', 'ویژگی lang="fa" یا fa-IR را روی html تنظیم کنید.'));
  checks.push(check('content', 'محتوای متنی کافی', wordCount >= minimumWords(route) ? 'pass' : 'warning', 7, `${wordCount} واژه؛ آستانهٔ عملی ${minimumWords(route)}`, 'محتوای people-first، مثال و پاسخ به سؤال‌های واقعی را گسترش دهید.'));
  checks.push(check('internal-links', 'لینک‌سازی داخلی', links.length >= (route.startsWith('/learn/') ? 4 : 2) ? 'pass' : 'warning', 5, `${links.length} لینک داخلی`, 'به صفحات مادر، راهنماهای مرتبط و ادیتور با anchor توصیفی لینک دهید.'));
  checks.push(check('structured-data', 'JSON-LD معتبر', schema.valid > 0 && schema.invalid === 0 ? 'pass' : schema.valid ? 'warning' : 'fail', 8, `${schema.valid} معتبر، ${schema.invalid} نامعتبر؛ ${schema.types.join(', ') || 'بدون type'}`, 'JSON-LD را با محتوای قابل مشاهده هماهنگ و syntax را معتبر نگه دارید.'));
  checks.push(check('social', 'Open Graph و Twitter Card', ogTitle && ogDescription && twitterCard ? 'pass' : 'warning', 4, `OG title: ${Boolean(ogTitle)}، OG description: ${Boolean(ogDescription)}، Twitter: ${Boolean(twitterCard)}`, 'متادیتای اشتراک‌گذاری را کامل کنید.'));
  checks.push(check('images', 'Alt تصاویر', images.missingAlt === 0 ? 'pass' : 'warning', 2, `${images.count} تصویر، ${images.missingAlt} بدون alt`, 'برای تصاویر محتوایی alt توصیفی و برای تصاویر تزئینی alt خالی قرار دهید.'));
  checks.push(check('sitemap', 'حضور در Sitemap', sitemapUrls.has(expectedCanonical) ? 'pass' : 'fail', 7, expectedCanonical || 'SITE_URL تنظیم نشده', 'URL canonical صفحه را در sitemap قرار دهید.'));
  checks.push(check('response-time', 'زمان پاسخ HTML', responseMs <= 800 ? 'pass' : responseMs <= 1_500 ? 'warning' : 'fail', 4, `${responseMs} ms`, 'TTFB سرور، reverse proxy و پردازش HTML را بررسی کنید.'));
  checks.push(check('page-size', 'اندازهٔ HTML کنترل‌شده', bytes <= 250_000 ? 'pass' : bytes <= 500_000 ? 'warning' : 'fail', 2, `${Math.round(bytes / 1024)} KB`, 'HTML تکراری و داده‌های inline حجیم را کاهش دهید.'));

  return {
    route,
    status,
    responseMs,
    bytes,
    score: scoreChecks(checks),
    checks,
    title,
    description,
    canonical,
    robots: robots || responseHeaders.xRobotsTag,
    h1,
    wordCount,
    links: links.length,
    images,
    schema,
    headers: responseHeaders,
  };
}

async function auditNoindex({ origin, route, timeoutMs }) {
  try {
    const { response, responseMs } = await fetchWithTimeout(`${origin}${route}`, { redirect: 'manual', headers: { Accept: 'text/html' } }, timeoutMs);
    const html = await response.text();
    const directive = `${robotsMeta(html)} ${response.headers.get('x-robots-tag') || ''}`.toLowerCase();
    return check('protected-noindex', `${route} از ایندکس خارج است`, directive.includes('noindex') ? 'pass' : 'fail', 5, `HTTP ${response.status} · ${responseMs} ms · ${directive || 'بدون noindex'}`, 'روی مسیرهای ابزاری و مدیریتی noindex قرار دهید.');
  } catch (error) {
    return check('protected-noindex', `بررسی ${route}`, 'warning', 2, error.message, 'مسیر را دستی بررسی کنید.');
  }
}

async function auditRedirect({ origin, from, to, timeoutMs }) {
  try {
    const { response } = await fetchWithTimeout(`${origin}${from}`, { redirect: 'manual' }, timeoutMs);
    const location = response.headers.get('location') || '';
    return check('redirect', `${from} → ${to}`, response.status === 301 && location === to ? 'pass' : 'fail', 3, `HTTP ${response.status} · Location: ${location || '—'}`, 'مسیر تکراری را با 301 مستقیم به canonical هدایت کنید.');
  } catch (error) {
    return check('redirect', `${from} → ${to}`, 'warning', 1, error.message, 'Redirect را دستی بررسی کنید.');
  }
}

export async function runSeoAudit({ origin, siteUrl, timeoutMs = 8_000 }) {
  const started = performance.now();
  const runAt = new Date().toISOString();
  const globalChecks = [];
  const issues = [];
  let sitemapText = '';
  let robotsText = '';

  try {
    const { response, responseMs } = await fetchWithTimeout(`${origin}/sitemap.xml`, { redirect: 'manual' }, timeoutMs);
    sitemapText = await response.text();
    globalChecks.push(check('sitemap-file', 'Sitemap در دسترس است', response.status === 200 && /<urlset\b/.test(sitemapText) ? 'pass' : 'fail', 10, `HTTP ${response.status} · ${responseMs} ms`, 'SITE_URL و route sitemap را بررسی کنید.'));
  } catch (error) {
    globalChecks.push(check('sitemap-file', 'Sitemap در دسترس است', 'fail', 10, error.message, 'SITE_URL و route sitemap را بررسی کنید.'));
  }

  try {
    const { response, responseMs } = await fetchWithTimeout(`${origin}/robots.txt`, { redirect: 'manual' }, timeoutMs);
    robotsText = await response.text();
    const expectedSitemap = absolute(siteUrl, '/sitemap.xml');
    const valid = response.status === 200 && (!expectedSitemap || robotsText.includes(expectedSitemap));
    globalChecks.push(check('robots-file', 'robots.txt معتبر است', valid ? 'pass' : 'fail', 7, `HTTP ${response.status} · ${responseMs} ms`, 'آدرس sitemap canonical را در robots.txt قرار دهید.'));
  } catch (error) {
    globalChecks.push(check('robots-file', 'robots.txt معتبر است', 'fail', 7, error.message, 'robots.txt را اصلاح کنید.'));
  }

  globalChecks.push(check('site-url', 'دامنهٔ canonical HTTPS', /^https:\/\//.test(siteUrl || '') ? 'pass' : 'fail', 12, siteUrl || 'SITE_URL خالی است.', 'SITE_URL را روی origin نهایی HTTPS بدون slash انتهایی قرار دهید.'));

  const sitemapUrls = new Set([...sitemapText.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]));
  const pages = [];
  for (const route of INDEXABLE_ROUTES) {
    const page = await auditPage({ origin, siteUrl, route, sitemapUrls, timeoutMs });
    pages.push(page);
    page.checks.map((item) => issueFrom(route, item)).filter(Boolean).forEach((item) => issues.push(item));
  }

  const noindexChecks = await Promise.all(NOINDEX_ROUTES.map((route) => auditNoindex({ origin, route, timeoutMs })));
  const redirectChecks = await Promise.all(Object.entries(LEGACY_REDIRECTS).map(([from, to]) => auditRedirect({ origin, from, to, timeoutMs })));
  globalChecks.push(...noindexChecks, ...redirectChecks);

  const sitemapDuplicates = sitemapUrls.size !== [...sitemapText.matchAll(/<loc>([^<]+)<\/loc>/g)].length;
  globalChecks.push(check('sitemap-duplicates', 'Sitemap بدون URL تکراری', sitemapDuplicates ? 'fail' : 'pass', 4, `${sitemapUrls.size} URL یکتا`, 'URLهای تکراری را حذف کنید.'));
  globalChecks.push(check('ai-search', 'محتوای اصلی در HTML قابل مشاهده است', pages.every((page) => page.wordCount > 40) ? 'pass' : 'warning', 4, 'این معیار برای Search و AI features یکسان است؛ فایل AI ویژه الزامی نیست.', 'محتوای مهم را به‌صورت متن قابل خزیدن نگه دارید.'));
  globalChecks.push(check('faq-2026', 'FAQ schema به‌عنوان امتیاز Rich Result محاسبه نمی‌شود', 'info', 0, 'از مه ۲۰۲۶ FAQ rich results در Google Search نمایش داده نمی‌شود؛ schema فقط برای معنای ماشینی باقی می‌ماند.', 'FAQ را فقط وقتی نگه دارید که متن آن واقعاً در صفحه دیده می‌شود.'));

  globalChecks.map((item) => issueFrom('site', item)).filter(Boolean).forEach((item) => issues.push(item));
  const pageWeight = pages.reduce((sum, page) => sum + page.checks.reduce((total, item) => total + item.weight, 0), 0);
  const pageEarned = pages.reduce((sum, page) => sum + (page.score / 100) * page.checks.reduce((total, item) => total + item.weight, 0), 0);
  const globalWeight = globalChecks.reduce((sum, item) => sum + item.weight, 0);
  const globalEarned = (scoreChecks(globalChecks) / 100) * globalWeight;
  const score = Math.round(((pageEarned + globalEarned) / Math.max(1, pageWeight + globalWeight)) * 100);
  const counts = {
    pages: pages.length,
    passedPages: pages.filter((page) => page.score >= 90).length,
    critical: issues.filter((issue) => issue.severity === 'critical').length,
    warning: issues.filter((issue) => issue.severity === 'warning').length,
    sitemapUrls: sitemapUrls.size,
  };

  return {
    runAt,
    durationMs: Math.round(performance.now() - started),
    score,
    grade: grade(score),
    counts,
    siteUrl,
    origin,
    pages,
    globalChecks,
    issues: issues.sort((a, b) => (a.severity === 'critical' ? -1 : 1) - (b.severity === 'critical' ? -1 : 1)).slice(0, 250),
  };
}

export { INDEXABLE_ROUTES, NOINDEX_ROUTES, LEGACY_REDIRECTS };
