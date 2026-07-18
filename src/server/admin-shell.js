const ADMIN_VIEWS = Object.freeze([
  { id: 'overview', icon: '⌁', label: 'نمای کلی', note: 'تصمیم‌های امروز' },
  { id: 'revenue', icon: '﷼', label: 'درآمد و تبلیغات', note: 'RPM، eCPM و جایگاه‌ها' },
  { id: 'seo', icon: '⌕', label: 'رشد ارگانیک', note: 'Search Console و محتوا' },
  { id: 'audit', icon: '✓', label: 'ممیزی فنی SEO', note: 'خزش زنده و خطاها' },
  { id: 'performance', icon: 'ϟ', label: 'تجربه و محصول', note: 'Web Vitals و قیف' },
  { id: 'settings', icon: '⚙', label: 'اهداف و داده', note: 'تنظیمات و رویدادها' },
]);

function renderAnalyticsItem(view, onContentPage) {
  const body = `<span>${view.icon}</span><b>${view.label}</b><small>${view.note}</small>`;
  return onContentPage
    ? `<a class="admin-nav-item" href="/admin/analytics#${view.id}">${body}</a>`
    : `<button class="admin-nav-item${view.id === 'overview' ? ' is-active' : ''}" type="button" data-admin-view="${view.id}">${body}</button>`;
}

export function renderAdminSidebar(pathname) {
  const onContentPage = pathname === '/admin/content';
  const analyticsItems = ADMIN_VIEWS.map((view) => renderAnalyticsItem(view, onContentPage)).join('');
  const contentItem = `<a class="admin-nav-item${onContentPage ? ' is-active' : ''}" href="/admin/content"${onContentPage ? ' aria-current="page"' : ''}><span>✎</span><b>عملیات محتوا</b><small>Brief، تقویم و سلامت صفحات</small></a>`;
  const health = onContentPage
    ? '<span class="health-dot" id="content-health-dot"></span><div><strong id="content-health-title">در حال دریافت داده…</strong><small id="content-health-note">موجودی و برنامهٔ تحریریه</small></div>'
    : '<span class="health-dot" id="sidebar-health-dot"></span><div><strong id="sidebar-health-title">در حال بررسی…</strong><small id="sidebar-health-note">وضعیت سرویس و داده</small></div>';

  return `<aside class="admin-sidebar">
        <a class="admin-brand" href="/" aria-label="صفحهٔ اصلی نمودارا"><img src="/logo.svg" width="44" height="44" alt="" /><span><strong>نمودارا</strong><small>مرکز کنترل رشد</small></span></a>
        <nav class="admin-nav" aria-label="بخش‌های پنل مدیریت">${analyticsItems}${contentItem}</nav>
        <div class="sidebar-health">${health}</div>
        <div class="sidebar-links"><a href="/" target="_blank" rel="noopener">مشاهده سایت</a><a href="/editor" target="_blank" rel="noopener">بازکردن ادیتور</a></div>
      </aside>`;
}

export function applyAdminShell(source, pathname) {
  const html = String(source || '');
  if (pathname !== '/admin/analytics' && pathname !== '/admin/content') return html;
  return html.replace(/<aside\s+class="admin-sidebar"[^>]*>[\s\S]*?<\/aside>/i, renderAdminSidebar(pathname));
}
