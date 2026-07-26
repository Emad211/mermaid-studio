import { LEARN_ARTICLES, getLearnArticle, learnSitemapEntries } from './learn-content.js';
import { EDITORIAL_ARTICLES, getEditorialArticle, articleSitemapEntries } from './article-content.js';

const DEFAULT_UPDATED = '2026-07-15';

const STATIC_PAGE_META = {
  '/': {
    title: 'نمودارا | ادیتور فارسی Mermaid و ساخت نمودار با کد',
    description: 'نمودارا، ادیتور رایگان و فارسی Mermaid برای ساخت فلوچارت، Sequence، ERD، گانت و UML با پیش‌نمایش زنده و خروجی SVG، PNG و PDF.',
    type: 'website',
    priority: 1,
  },
  '/templates': {
    title: 'قالب‌های رایگان Mermaid فارسی | نمودارا',
    description: 'قالب‌های فارسی و قابل ویرایش Mermaid برای فلوچارت، نمودار توالی، ERD، کلاس UML، گانت، معماری و نقشه ذهنی.',
    type: 'website',
    priority: 0.9,
  },
  '/learn': {
    title: 'آموزش Mermaid به فارسی؛ مثال‌محور و رایگان | نمودارا',
    description: 'مرجع رایگان آموزش Mermaid به فارسی با مثال‌های قابل ویرایش برای فلوچارت، Sequence Diagram، ERD، Gantt، UML، معماری و رفع خطا.',
    type: 'website',
    priority: 0.95,
  },
  '/articles': {
    title: 'مقاله‌های نمودارا؛ Diagram as Code و مستندسازی فنی',
    description: 'مقاله‌های تحلیلی و تجربه‌محور دربارهٔ Diagram as Code، انتخاب نوع نمودار، مستندسازی معماری و خروجی حرفه‌ای Mermaid.',
    type: 'website',
    priority: 0.88,
  },
  '/about': {
    title: 'دربارهٔ نمودارا و روش ساخت این پروژه',
    description: 'نمودارا چرا ساخته شد، چه داده‌ای ثبت نمی‌کند و آموزش‌ها و مثال‌های فنی آن چگونه نوشته و آزمایش می‌شوند.',
    type: 'website',
    priority: 0.45,
  },
  '/editorial-policy': {
    title: 'سیاست تحریریهٔ نمودارا؛ نویسندگی، تست و به‌روزرسانی محتوا',
    description: 'روش انتخاب موضوع، تست مثال‌های Mermaid، بازبینی، اصلاح خطا و به‌روزرسانی مقاله‌ها و آموزش‌های نمودارا.',
    type: 'website',
    priority: 0.35,
  },
  '/privacy': {
    title: 'سیاست حریم خصوصی | نمودارا',
    description: 'سیاست حریم خصوصی، تحلیل first-party، تبلیغات و پردازش محلی نمودارها در نمودارا.',
    type: 'website',
    priority: 0.2,
  },
  '/terms': {
    title: 'شرایط استفاده | نمودارا',
    description: 'شرایط استفاده از نسخهٔ رایگان و عمومی نمودارا و محدودیت‌های فنی سرویس.',
    type: 'website',
    priority: 0.2,
  },
  '/editor': {
    title: 'ادیتور آنلاین Mermaid فارسی | نمودارا',
    description: 'کد Mermaid را بنویسید، نمودار را زنده ببینید و در فرمت SVG، PNG، WebP، JPG یا PDF خروجی بگیرید.',
    type: 'website',
    robots: 'noindex,follow,noarchive',
    priority: 0,
  },
};

function cleanUrl(value, production) {
  const raw = String(value || '').trim();
  if (!raw) return production ? '' : 'http://localhost:4321';
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    if (production && url.protocol !== 'https:') return '';
    url.hash = '';
    url.search = '';
    url.pathname = url.pathname.replace(/\/+$/, '') || '/';
    return url.href.replace(/\/$/, '');
  } catch {
    return '';
  }
}

function safeVerification(value) {
  const text = String(value || '').trim();
  return /^[A-Za-z0-9._~+=:/-]{6,300}$/.test(text) ? text : '';
}

export function seoConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  return {
    siteUrl: cleanUrl(env.SITE_URL, production),
    siteName: String(env.SITE_NAME || 'نمودارا').trim().slice(0, 80) || 'نمودارا',
    locale: 'fa_IR',
    language: 'fa-IR',
    updated: String(env.SEO_LAST_MODIFIED || DEFAULT_UPDATED).trim() || DEFAULT_UPDATED,
    googleVerification: safeVerification(env.GOOGLE_SITE_VERIFICATION),
    bingVerification: safeVerification(env.BING_SITE_VERIFICATION),
    authorName: String(env.SEO_AUTHOR_NAME || 'تیم تحریریه نمودارا').trim().slice(0, 100),
    githubUrl: 'https://github.com/Emad211/mermaid-studio',
  };
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function escapeXml(value) {
  return escapeHtml(value);
}

function jsonLd(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function normalizePathname(value) {
  let pathname = String(value || '/').split('?')[0].split('#')[0] || '/';
  pathname = pathname.replace(/\/{2,}/g, '/');
  if (pathname !== '/') pathname = pathname.replace(/\/$/, '');
  if (pathname === '/fa') return '/';
  if (pathname === '/examples') return '/templates';
  if (pathname === '/index.html') return '/editor';
  if (pathname === '/privacy.html') return '/privacy';
  if (pathname === '/terms.html') return '/terms';
  return pathname;
}

function absolute(config, pathname = '/') {
  if (!config.siteUrl) return '';
  return new URL(pathname, `${config.siteUrl}/`).href;
}

function breadcrumb(config, items) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absolute(config, item.path),
    })),
  };
}

function baseGraph(config) {
  const websiteId = `${config.siteUrl}/#website`;
  const organizationId = `${config.siteUrl}/#organization`;
  return [
    {
      '@type': 'Organization',
      '@id': organizationId,
      name: config.siteName,
      url: config.siteUrl,
      logo: { '@type': 'ImageObject', url: absolute(config, '/logo.svg') },
      sameAs: [config.githubUrl],
    },
    {
      '@type': 'WebSite',
      '@id': websiteId,
      url: config.siteUrl,
      name: config.siteName,
      inLanguage: config.language,
      publisher: { '@id': organizationId },
    },
  ];
}

function softwareApplication(config) {
  return {
    '@type': 'SoftwareApplication',
    '@id': `${config.siteUrl}/#app`,
    name: config.siteName,
    url: absolute(config, '/editor'),
    applicationCategory: 'DeveloperApplication',
    applicationSubCategory: 'DiagrammingApplication',
    operatingSystem: 'Web, Windows, macOS, Linux',
    inLanguage: config.language,
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'IRR' },
    featureList: [
      'Live Mermaid preview',
      'Persian user interface',
      'SVG PNG JPG WebP and PDF export',
      'Flowchart Sequence ERD Gantt UML and architecture diagrams',
      'Local-first image export',
    ],
    softwareHelp: absolute(config, '/learn'),
    downloadUrl: config.githubUrl,
    publisher: { '@id': `${config.siteUrl}/#organization` },
  };
}

function pageStructuredData(pathname, meta, config, article, editorialArticle) {
  if (!config.siteUrl) return null;
  const graph = baseGraph(config);
  const canonical = absolute(config, pathname);

  if (pathname === '/') {
    graph.push(softwareApplication(config));
    graph.push({
      '@type': 'WebPage',
      '@id': `${canonical}#webpage`,
      url: canonical,
      name: meta.title,
      description: meta.description,
      inLanguage: config.language,
      isPartOf: { '@id': `${config.siteUrl}/#website` },
      about: { '@id': `${config.siteUrl}/#app` },
    });
  } else if (pathname === '/templates') {
    graph.push({
      '@type': 'CollectionPage',
      '@id': `${canonical}#webpage`,
      url: canonical,
      name: meta.title,
      description: meta.description,
      inLanguage: config.language,
      isPartOf: { '@id': `${config.siteUrl}/#website` },
      breadcrumb: breadcrumb(config, [{ name: 'خانه', path: '/' }, { name: 'قالب‌های Mermaid', path: '/templates' }]),
      mainEntity: {
        '@type': 'ItemList',
        itemListElement: [
          'فلوچارت تصمیم‌گیری', 'نمودار توالی API', 'مدل ER فروشگاه', 'نمودار کلاس UML',
          'گانت انتشار', 'نقشه ذهنی محتوا', 'معماری ابری', 'سفر کاربر',
          "عملکرد ماهانه در برابر هدف",
          "سفر خرید فروشگاه اینترنتی",
          "ردیابی نیازمندی ورود امن",
          "Timeline roadmap محصول",
          "برد کانبان انتشار محتوا",
          "Git Flow برای release و hotfix",
          "چرخهٔ وضعیت سفارش",
        ].map((name, index) => ({ '@type': 'ListItem', position: index + 1, name })),
      },
    });
  } else if (pathname === '/learn') {
    graph.push({
      '@type': 'CollectionPage',
      '@id': `${canonical}#webpage`,
      url: canonical,
      name: meta.title,
      description: meta.description,
      inLanguage: config.language,
      isPartOf: { '@id': `${config.siteUrl}/#website` },
      breadcrumb: breadcrumb(config, [{ name: 'خانه', path: '/' }, { name: 'آموزش Mermaid', path: '/learn' }]),
      mainEntity: {
        '@type': 'ItemList',
        itemListElement: LEARN_ARTICLES.map((item, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: item.title,
          url: absolute(config, `/learn/${item.slug}`),
        })),
      },
    });
  } else if (pathname === '/articles') {
    graph.push({
      '@type': 'CollectionPage',
      '@id': `${canonical}#webpage`,
      url: canonical,
      name: meta.title,
      description: meta.description,
      inLanguage: config.language,
      isPartOf: { '@id': `${config.siteUrl}/#website` },
      breadcrumb: breadcrumb(config, [{ name: 'خانه', path: '/' }, { name: 'مقاله‌ها', path: '/articles' }]),
      mainEntity: {
        '@type': 'ItemList',
        itemListElement: EDITORIAL_ARTICLES.map((item, index) => ({ '@type': 'ListItem', position: index + 1, name: item.title, url: absolute(config, `/articles/${item.slug}`) })),
      },
    });
  } else if (editorialArticle) {
    graph.push({
      '@type': 'Article',
      '@id': `${canonical}#article`,
      mainEntityOfPage: canonical,
      url: canonical,
      headline: editorialArticle.title,
      description: editorialArticle.description,
      inLanguage: config.language,
      datePublished: editorialArticle.published || DEFAULT_UPDATED,
      dateModified: editorialArticle.updated || DEFAULT_UPDATED,
      author: { '@type': 'Organization', name: editorialArticle.author?.name || config.authorName, url: absolute(config, '/about#editorial') },
      publisher: { '@id': `${config.siteUrl}/#organization` },
      image: absolute(config, '/og-image.svg'),
      keywords: editorialArticle.keywords.join(', '),
      about: { '@type': 'Thing', name: editorialArticle.category || 'Diagram as Code' },
      breadcrumb: breadcrumb(config, [
        { name: 'خانه', path: '/' },
        { name: 'مقاله‌ها', path: '/articles' },
        { name: editorialArticle.title, path: `/articles/${editorialArticle.slug}` },
      ]),
    });
  } else if (article) {
    const articleId = `${canonical}#article`;
    graph.push({
      '@type': 'TechArticle',
      '@id': articleId,
      mainEntityOfPage: canonical,
      url: canonical,
      headline: article.title,
      description: article.description,
      inLanguage: config.language,
      datePublished: article.updated || DEFAULT_UPDATED,
      dateModified: article.updated || DEFAULT_UPDATED,
      author: { '@type': 'Organization', name: config.authorName, url: config.siteUrl },
      publisher: { '@id': `${config.siteUrl}/#organization` },
      image: absolute(config, '/og-image.svg'),
      keywords: article.keywords.join(', '),
      proficiencyLevel: article.level,
      timeRequired: `PT${article.minutes}M`,
      about: { '@type': 'Thing', name: 'Mermaid diagram syntax' },
      breadcrumb: breadcrumb(config, [
        { name: 'خانه', path: '/' },
        { name: 'آموزش Mermaid', path: '/learn' },
        { name: article.shortTitle, path: `/learn/${article.slug}` },
      ]),
      mainEntity: article.faq?.length ? {
        '@type': 'FAQPage',
        mainEntity: article.faq.map(([question, answer]) => ({
          '@type': 'Question',
          name: question,
          acceptedAnswer: { '@type': 'Answer', text: answer },
        })),
      } : undefined,
    });
  } else {
    graph.push({
      '@type': 'WebPage',
      '@id': `${canonical}#webpage`,
      url: canonical,
      name: meta.title,
      description: meta.description,
      inLanguage: config.language,
      isPartOf: { '@id': `${config.siteUrl}/#website` },
    });
  }

  return { '@context': 'https://schema.org', '@graph': graph };
}

export function pageSeo(pathname, config = seoConfig()) {
  const normalized = normalizePathname(pathname);
  const articleSlug = normalized.startsWith('/learn/') ? normalized.slice('/learn/'.length) : '';
  const article = articleSlug ? getLearnArticle(articleSlug) : null;
  const editorialSlug = normalized.startsWith('/articles/') ? normalized.slice('/articles/'.length) : '';
  const editorialArticle = editorialSlug ? getEditorialArticle(editorialSlug) : null;
  if (editorialArticle) {
    return {
      pathname: normalized,
      title: `${editorialArticle.title} | نمودارا`,
      description: editorialArticle.description,
      type: 'article',
      robots: 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1',
      editorialArticle,
      canonical: absolute(config, normalized),
    };
  }
  if (article) {
    return {
      pathname: normalized,
      title: article.title,
      description: article.description,
      type: 'article',
      robots: 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1',
      article,
      canonical: absolute(config, normalized),
    };
  }
  const meta = STATIC_PAGE_META[normalized] || {
    title: `صفحه پیدا نشد | ${config.siteName}`,
    description: 'صفحهٔ درخواستی در Mermaid Studio پیدا نشد.',
    type: 'website',
    robots: 'noindex,follow',
    priority: 0,
  };
  return {
    pathname: normalized,
    ...meta,
    robots: meta.robots || 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1',
    canonical: absolute(config, normalized),
  };
}

function replaceOrInsert(html, pattern, replacement, before = '</head>') {
  if (pattern.test(html)) return html.replace(pattern, replacement);
  return html.replace(before, `  ${replacement}\n${before}`);
}

export function enhanceHtml(input, pathname, config = seoConfig()) {
  const meta = pageSeo(pathname, config);
  let html = String(input);
  html = replaceOrInsert(html, /<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(meta.title)}</title>`);
  html = replaceOrInsert(html, /<meta\s+name=["']description["'][^>]*>/i, `<meta name="description" content="${escapeHtml(meta.description)}" />`);
  html = replaceOrInsert(html, /<meta\s+name=["']robots["'][^>]*>/i, `<meta name="robots" content="${escapeHtml(meta.robots)}" />`);

  html = html
    .replace(/\s*<link\s+rel=["']canonical["'][^>]*>\s*/gi, '\n')
    .replace(/\s*<link\s+rel=["']alternate["'][^>]*hreflang[^>]*>\s*/gi, '\n')
    .replace(/\s*<meta\s+(?:property|name)=["'](?:og:|twitter:)[^>]*>\s*/gi, '\n')
    .replace(/\s*<meta\s+name=["'](?:google-site-verification|msvalidate\.01)["'][^>]*>\s*/gi, '\n')
    .replace(/\s*<script\s+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>\s*/gi, '\n');

  const tags = [];
  if (meta.canonical) {
    tags.push(`<link rel="canonical" href="${escapeHtml(meta.canonical)}" />`);
    tags.push(`<link rel="alternate" hreflang="fa-IR" href="${escapeHtml(meta.canonical)}" />`);
    tags.push(`<link rel="alternate" hreflang="x-default" href="${escapeHtml(meta.canonical)}" />`);
  }
  tags.push(`<meta property="og:site_name" content="${escapeHtml(config.siteName)}" />`);
  tags.push(`<meta property="og:locale" content="${escapeHtml(config.locale)}" />`);
  tags.push(`<meta property="og:type" content="${escapeHtml(meta.type)}" />`);
  tags.push(`<meta property="og:title" content="${escapeHtml(meta.title)}" />`);
  tags.push(`<meta property="og:description" content="${escapeHtml(meta.description)}" />`);
  if (meta.canonical) tags.push(`<meta property="og:url" content="${escapeHtml(meta.canonical)}" />`);
  if (config.siteUrl) tags.push(`<meta property="og:image" content="${escapeHtml(absolute(config, '/og-image.svg'))}" />`);
  tags.push('<meta name="twitter:card" content="summary_large_image" />');
  tags.push(`<meta name="twitter:title" content="${escapeHtml(meta.title)}" />`);
  tags.push(`<meta name="twitter:description" content="${escapeHtml(meta.description)}" />`);
  if (config.siteUrl) tags.push(`<meta name="twitter:image" content="${escapeHtml(absolute(config, '/og-image.svg'))}" />`);
  if (config.googleVerification) tags.push(`<meta name="google-site-verification" content="${escapeHtml(config.googleVerification)}" />`);
  if (config.bingVerification) tags.push(`<meta name="msvalidate.01" content="${escapeHtml(config.bingVerification)}" />`);

  const structured = pageStructuredData(meta.pathname, meta, config, meta.article, meta.editorialArticle);
  if (structured) tags.push(`<script type="application/ld+json">${jsonLd(structured)}</script>`);
  html = html.replace('</head>', `  ${tags.join('\n  ')}\n</head>`);
  return { html, meta };
}

export function sitemapXml(config = seoConfig()) {
  if (!config.siteUrl) return '';
  const entries = [
    ...Object.entries(STATIC_PAGE_META)
      .filter(([pathname, meta]) => meta.priority > 0 && !meta.robots?.startsWith('noindex'))
      .map(([pathname, meta]) => ({ path: pathname, updated: config.updated, priority: meta.priority })),
    ...learnSitemapEntries(),
    ...articleSitemapEntries(),
  ];
  const uniqueEntries = [...new Map(entries.map((entry) => [entry.path, entry])).values()];
  const urls = uniqueEntries.map((entry) => `<url><loc>${escapeXml(absolute(config, entry.path))}</loc><lastmod>${escapeXml(entry.updated || config.updated)}</lastmod><changefreq>${entry.path.startsWith('/learn/') ? 'monthly' : 'weekly'}</changefreq><priority>${Number(entry.priority || 0.5).toFixed(2)}</priority></url>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>\n`;
}

export function robotsTxt(config = seoConfig()) {
  const sitemap = config.siteUrl ? `\nSitemap: ${absolute(config, '/sitemap.xml')}` : '';
  return `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /admin/\nDisallow: /headless\n${sitemap}\n`;
}

export function llmsTxt(config = seoConfig()) {
  const origin = config.siteUrl || 'https://example.invalid';
  const guides = LEARN_ARTICLES.map((article) => `- [${article.title}](${origin}/learn/${article.slug}): ${article.description}`).join('\n');
  const magazine = EDITORIAL_ARTICLES.map((article) => `- [${article.title}](${origin}/articles/${article.slug}): ${article.description}`).join('\n');
  return `# ${config.siteName}\n\n> ابزار رایگان و فارسی برای نوشتن، پیش‌نمایش و خروجی گرفتن از نمودارهای Mermaid؛ همراه با آموزش مثال‌محور و مقاله‌های تحلیلی دربارهٔ مستندسازی.\n\n## صفحات اصلی\n\n- [ادیتور](${origin}/editor): پیش‌نمایش زنده و خروجی SVG، PNG، JPG، WebP و PDF.\n- [قالب‌ها](${origin}/templates): نمونه‌های قابل ویرایش.\n- [مرکز آموزش](${origin}/learn): راهنماهای عملی Mermaid.\n- [مقاله‌ها](${origin}/articles): Diagram as Code، معماری و نگهداری مستندات.\n- [سیاست تحریریه](${origin}/editorial-policy): روش نویسندگی، تست و به‌روزرسانی.\n\n## راهنماها\n\n${guides}\n\n## مقاله‌های تحلیلی\n\n${magazine}\n\n## سیاست داده\n\nآنالیز محصول first-party و تجمیعی است؛ کد Mermaid، متن نمودار و IP خام ذخیره نمی‌شوند.\n`;
}

export function ogImageSvg(config = seoConfig()) {
  const title = escapeXml(config.siteName);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="${title}"><defs><linearGradient id="bg" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#0b0d15"/><stop offset="1" stop-color="#211633"/></linearGradient><linearGradient id="mark" x1="0" x2="1"><stop stop-color="#1f5b43"/><stop offset="1" stop-color="#d55f39"/></linearGradient></defs><rect width="1200" height="630" fill="url(#bg)"/><circle cx="1080" cy="80" r="260" fill="#1f5b43" opacity=".12"/><circle cx="150" cy="580" r="260" fill="#d55f39" opacity=".1"/><rect x="92" y="92" width="120" height="120" rx="34" fill="url(#mark)"/><path d="M122 174V125l24 29 22-29v49M182 126c18 0 28 10 28 25 0 22-28 23-28 42" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/><text x="1100" y="300" text-anchor="end" fill="#fff" font-family="Tahoma,Arial,sans-serif" font-size="72" font-weight="700">نمودارا</text><text x="1100" y="385" text-anchor="end" fill="#d9dcec" font-family="Tahoma,Arial,sans-serif" font-size="43">نمودار به‌صورت کد؛ روشن و قابل نگهداری</text><text x="1100" y="470" text-anchor="end" fill="#9ca5b8" font-family="Tahoma,Arial,sans-serif" font-size="29">رایگان · فارسی · پیش‌نمایش زنده · خروجی SVG و PDF</text></svg>`;
}

export function canonicalRedirect(pathname) {
  const raw = String(pathname || '/');
  const redirects = {
    '/fa': '/', '/fa/': '/',
    '/templates/': '/templates', '/examples': '/templates', '/examples/': '/templates',
    '/learn/': '/learn', '/articles/': '/articles', '/about/': '/about', '/editorial-policy/': '/editorial-policy',
    '/editor/': '/editor', '/index.html': '/editor',
    '/privacy/': '/privacy', '/privacy.html': '/privacy',
    '/terms/': '/terms', '/terms.html': '/terms',
  };
  return redirects[raw] || null;
}
