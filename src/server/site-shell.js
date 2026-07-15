const PUBLIC_SECTIONS = Object.freeze([
  { id: 'home', href: '/', label: 'خانه' },
  { id: 'learn', href: '/learn', label: 'آموزش' },
  { id: 'articles', href: '/articles', label: 'مجله' },
  { id: 'templates', href: '/templates', label: 'قالب‌ها' },
  { id: 'about', href: '/about', label: 'دربارهٔ ما' },
]);

function sectionFor(pathname) {
  if (pathname === '/') return 'home';
  if (pathname === '/learn' || pathname.startsWith('/learn/')) return 'learn';
  if (pathname === '/articles' || pathname.startsWith('/articles/')) return 'articles';
  if (pathname === '/templates') return 'templates';
  if (pathname === '/about' || pathname === '/editorial-policy') return 'about';
  return '';
}

function isPublicContentPath(pathname) {
  return pathname === '/404'
    || pathname === '/privacy'
    || pathname === '/terms'
    || PUBLIC_SECTIONS.some(({ href }) => pathname === href || (href !== '/' && pathname.startsWith(`${href}/`)));
}

export function renderSiteHeader(pathname) {
  const current = sectionFor(pathname);
  const links = PUBLIC_SECTIONS.map(({ id, href, label }) => `<a href="${href}"${id === current ? ' aria-current="page"' : ''}>${label}</a>`).join('');
  const mobileLinks = PUBLIC_SECTIONS.map(({ href, label }) => `<a href="${href}">${label}</a>`).join('');
  return `<header class="site-header">
      <a class="brand" href="/" aria-label="نمودارا، صفحهٔ اصلی"><img class="brand-mark" src="/logo.svg" width="38" height="38" alt="" /><span class="brand-copy"><strong>نمودارا</strong><small>ابزار فارسی ساخت نمودار</small></span></a>
      <nav class="main-nav" aria-label="ناوبری اصلی">${links}</nav>
      <div class="header-actions"><button id="theme-toggle" class="icon-button" type="button" aria-label="تغییر پوسته">☀</button><a class="button button-small" href="/editor">بازکردن ادیتور</a><details class="mobile-menu"><summary aria-label="نمایش منو">منو</summary><nav aria-label="منوی موبایل">${mobileLinks}<a href="/privacy">حریم خصوصی</a></nav></details></div>
    </header>`;
}

export function applySiteShell(source, pathname) {
  let html = String(source || '');
  if (!isPublicContentPath(pathname)) return html;

  const header = renderSiteHeader(pathname);
  const existingHeader = /<header\s+class="(?:site-header|docs-header)"[^>]*>[\s\S]*?<\/header>/i;
  html = existingHeader.test(html)
    ? html.replace(existingHeader, header)
    : html.replace(/(<body\b[^>]*>)/i, `$1\n    ${header}`);

  if (!/<link\s+[^>]*rel="icon"/i.test(html)) {
    html = html.replace('</head>', '  <link rel="icon" href="/logo.svg" type="image/svg+xml" />\n</head>');
  }

  if (!html.includes('/js/site-shell.js')) {
    html = html.replace('</body>', '  <script type="module" src="/js/site-shell.js?v=%V%"></script>\n</body>');
  }
  return html;
}
