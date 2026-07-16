#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path.cwd()


def replace_once(path: str, old: str, new: str) -> None:
    file = ROOT / path
    text = file.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'Expected block not found in {path}: {old[:140]!r}')
    file.write_text(text.replace(old, new, 1), encoding='utf-8')


def append_before(path: str, marker: str, content: str) -> None:
    file = ROOT / path
    text = file.read_text(encoding='utf-8')
    if content.strip() in text:
        return
    if marker not in text:
        raise SystemExit(f'Marker not found in {path}: {marker!r}')
    file.write_text(text.replace(marker, content + marker, 1), encoding='utf-8')


# ---------------------------------------------------------------------------
# Express integration: isolated frame CSP, editor inventory and launch audit.
# ---------------------------------------------------------------------------
replace_once(
    'src/server/app.js',
    "import { advertisingConfig, advertisingCspSources, prepareAdvertisingHtml } from './ads.js';",
    "import { advertisingConfig, advertisingCspSources, editorFrameCspSources, prepareAdvertisingHtml, renderEditorAdFrame } from './ads.js';",
)
replace_once(
    'src/server/app.js',
    "import { buildGrowthReport, previousRange } from './growth-insights.js';",
    "import { buildGrowthReport, previousRange } from './growth-insights.js';\nimport { buildLaunchReadiness } from './launch-readiness.js';",
)
replace_once(
    'src/server/app.js',
    """function contentSecurityPolicy(req, environment, inlineHashes = []) {
  const adSources = advertisingAllowed(req.path) ? advertisingCspSources(environment) : [];
  const external = adSources.length ? ` ${adSources.join(' ')}` : '';
  return [
    "default-src 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `script-src 'self'${external}${inlineHashes.length ? ` ${inlineHashes.join(' ')}` : ''}`,
    `style-src 'self' 'unsafe-inline'${external}`,
    `img-src 'self' data: blob:${external}`,
    `font-src 'self' data:${external}`,
    `connect-src 'self'${external}`,
    `frame-src 'self'${external}`,
    "media-src 'none'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
  ].join('; ');
}
""",
    """function contentSecurityPolicy(req, environment, inlineHashes = []) {
  const adSources = advertisingAllowed(req.path) ? advertisingCspSources(environment) : [];
  const editorFrames = req.path === '/editor' ? editorFrameCspSources(environment) : [];
  const external = adSources.length ? ` ${adSources.join(' ')}` : '';
  const frameExternal = editorFrames.length ? ` ${editorFrames.join(' ')}` : '';
  return [
    "default-src 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `script-src 'self'${external}${inlineHashes.length ? ` ${inlineHashes.join(' ')}` : ''}`,
    `style-src 'self' 'unsafe-inline'${external}`,
    `img-src 'self' data: blob:${external}`,
    `font-src 'self' data:${external}`,
    `connect-src 'self'${external}`,
    `frame-src 'self'${frameExternal}${external}`,
    "media-src 'none'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
  ].join('; ');
}

function safeHttpsOrigin(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' ? url.origin : '';
  } catch {
    return '';
  }
}

function editorAdFramePolicy(environment, inlineHashes = []) {
  const sources = advertisingCspSources(environment);
  const external = sources.length ? ` ${sources.join(' ')}` : '';
  const parentOrigin = safeHttpsOrigin(environment.SITE_URL) || "'self'";
  return [
    "default-src 'none'",
    "base-uri 'none'",
    "object-src 'none'",
    `frame-ancestors ${parentOrigin}`,
    "form-action 'none'",
    `script-src 'self'${external}${inlineHashes.length ? ` ${inlineHashes.join(' ')}` : ''}`,
    `style-src 'unsafe-inline'${external}`,
    `img-src data: blob:${external}`,
    `font-src data:${external}`,
    `connect-src${external || " 'none'"}`,
    `frame-src${external || " 'none'"}`,
    `media-src${external || " 'none'"}`,
  ].join('; ');
}
""",
)
replace_once(
    'src/server/app.js',
    "  if (advertisingAllowed(pathname)) html = prepareAdvertisingHtml(html, state.environment);",
    "  if (advertisingAllowed(pathname) || pathname === '/editor') html = prepareAdvertisingHtml(html, state.environment);",
)

route_anchor = """  app.get('/api/analytics/config', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(state.analytics.publicConfig());
  });
"""
route_addition = route_anchor + """
  app.get('/ads/editor-frame', (req, res, next) => {
    try {
      const html = renderEditorAdFrame(req.query.slot, environment);
      if (!html) throw new HttpError(404, 'EDITOR_AD_NOT_CONFIGURED', 'Editor advertising frame is not configured.');
      const hashes = inlineScriptHashes(html);
      res.removeHeader('X-Frame-Options');
      res.removeHeader('Cross-Origin-Opener-Policy');
      res.setHeader('Content-Security-Policy', editorAdFramePolicy(environment, hashes));
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store, max-age=0');
      res.setHeader('Referrer-Policy', 'origin');
      res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
      res.send(html);
    } catch (error) {
      next(error);
    }
  });
"""
replace_once('src/server/app.js', route_anchor, route_addition)

integration_anchor = """  app.get('/api/admin/integrations/status', adminLimit, adminAuth, async (_req, res, next) => {
    try {
      const persisted = await state.adminStore.integrationStatus();
      const gsc = searchConsoleConfig(environment);
      const indexNow = indexNowConfig(environment);
      res.json({
        searchConsole: { configured: gsc.enabled, siteUrl: gsc.siteUrl, last: persisted.services?.searchConsole || null },
        indexNow: { configured: indexNow.enabled, endpoint: indexNow.endpoint, last: persisted.services?.indexNow || null },
      });
    } catch (error) {
      next(error);
    }
  });
"""
launch_route = integration_anchor + """

  app.get('/api/admin/launch/readiness', adminLimit, adminAuth, async (_req, res, next) => {
    try {
      const persisted = await state.adminStore.integrationStatus();
      const gsc = searchConsoleConfig(environment);
      const indexNow = indexNowConfig(environment);
      res.json(buildLaunchReadiness({
        environment,
        seo: state.seo,
        analytics: state.analytics.health(),
        advertising: advertisingConfig(environment),
        integrations: {
          searchConsole: { configured: gsc.enabled, last: persisted.services?.searchConsole || null },
          indexNow: { configured: indexNow.enabled, last: persisted.services?.indexNow || null },
        },
      }));
    } catch (error) {
      next(error);
    }
  });
"""
replace_once('src/server/app.js', integration_anchor, launch_route)

# ---------------------------------------------------------------------------
# Editor DOM: responsive rail/dock inventory, separate frame loader.
# ---------------------------------------------------------------------------
replace_once(
    'public/index.html',
    '    <link rel="stylesheet" href="/css/editor-experience.css?v=%V%" />',
    '    <link rel="stylesheet" href="/css/editor-experience.css?v=%V%" />\n    <link rel="stylesheet" href="/css/editor-ads.css?v=%V%" />',
)
replace_once(
    'public/index.html',
    '    <main class="workspace" id="workspace">',
    '    <div class="editor-stage-layout">\n    <main class="workspace" id="workspace">',
)
replace_once(
    'public/index.html',
    """    </main>

    <aside id="drawer" class="drawer">
""",
    """    </main>

      <aside class="editor-ad-shell editor-ad-shell--rail" data-editor-ad-slot data-ad-slot="editorRail" hidden aria-label="تبلیغات ادیتور">
        <div class="editor-ad-shell__head"><span>تبلیغات</span><a href="/privacy#advertising" target="_blank" rel="noopener">حریم خصوصی</a></div>
        <div class="editor-ad-shell__frame-wrap"><span class="editor-ad-shell__state">فضای تبلیغ از محیط کد جداست.</span><iframe data-editor-ad-frame title="تبلیغات در کنار ادیتور" loading="lazy"></iframe></div>
      </aside>
    </div>

    <aside class="editor-ad-shell editor-ad-shell--dock" data-editor-ad-slot data-ad-slot="editorDock" hidden aria-label="تبلیغات ادیتور">
      <div class="editor-ad-shell__head"><span>تبلیغات</span><a href="/privacy#advertising" target="_blank" rel="noopener">حریم خصوصی</a></div>
      <div class="editor-ad-shell__frame-wrap"><span class="editor-ad-shell__state">فضای تبلیغ از محیط کد جداست.</span><iframe data-editor-ad-frame title="تبلیغات زیر ادیتور" loading="lazy"></iframe></div>
    </aside>

    <aside id="drawer" class="drawer">
""",
)
replace_once(
    'public/index.html',
    '    <script type="module" src="/js/editor-experience.js?v=%V%"></script>',
    '    <script type="module" src="/js/editor-experience.js?v=%V%"></script>\n    <script type="module" src="/js/editor-ads.js?v=%V%"></script>',
)

# ---------------------------------------------------------------------------
# Analytics: distinguish viewable inventory from publisher impressions.
# ---------------------------------------------------------------------------
replace_once(
    'public/js/analytics.js',
    """    loaded: 'ad_script_loaded',
    error: 'ad_script_error',
    blocked: 'ad_blocked',
""",
    """    loaded: 'ad_script_loaded',
    viewable: 'ad_viewable',
    error: 'ad_script_error',
    blocked: 'ad_blocked',
""",
)
replace_once(
    'public/js/analytics.js',
    """  'template_open', 'ad_slot_view', 'ad_script_loaded', 'ad_script_error', 'ad_blocked',
""",
    """  'template_open', 'ad_slot_view', 'ad_viewable', 'ad_script_loaded', 'ad_script_error', 'ad_blocked',
""",
)
replace_once(
    'src/server/analytics.js',
    """  'ad_slot_view',
  'ad_script_loaded',
""",
    """  'ad_slot_view',
  'ad_viewable',
  'ad_script_loaded',
""",
)
replace_once(
    'src/server/analytics.js',
    """        data.adSlots[payload.slot] ||= { views: 0, loaded: 0, errors: 0, blocked: 0 };
""",
    """        data.adSlots[payload.slot] ||= { views: 0, viewable: 0, loaded: 0, errors: 0, blocked: 0 };
""",
)
replace_once(
    'src/server/analytics.js',
    """        if (payload.event === 'ad_script_loaded') data.adSlots[payload.slot].loaded += 1;
""",
    """        if (payload.event === 'ad_viewable') data.adSlots[payload.slot].viewable += 1;
        if (payload.event === 'ad_script_loaded') data.adSlots[payload.slot].loaded += 1;
""",
)
replace_once(
    'src/server/analytics.js',
    """          adSlotViews: 0,
          revenueRial: 0,
""",
    """          adSlotViews: 0,
          adViewable: 0,
          revenueRial: 0,
""",
)
replace_once(
    'src/server/analytics.js',
    """          adSlots[slot] ||= { views: 0, loaded: 0, errors: 0, blocked: 0 };
""",
    """          adSlots[slot] ||= { views: 0, viewable: 0, loaded: 0, errors: 0, blocked: 0 };
""",
)
replace_once(
    'src/server/analytics.js',
    """          adSlotViews: Object.values(value.adSlots || {}).reduce((sum, stats) => sum + finite(stats.views), 0),
""",
    """          adSlotViews: Object.values(value.adSlots || {}).reduce((sum, stats) => sum + finite(stats.views), 0),
          adViewable: Object.values(value.adSlots || {}).reduce((sum, stats) => sum + finite(stats.viewable), 0),
""",
)
replace_once(
    'src/server/analytics.js',
    """    const totalAdSlotViews = Object.values(adSlots).reduce((sum, stats) => sum + finite(stats.views), 0);
""",
    """    const totalAdSlotViews = Object.values(adSlots).reduce((sum, stats) => sum + finite(stats.views), 0);
    const totalAdViewable = Object.values(adSlots).reduce((sum, stats) => sum + finite(stats.viewable), 0);
""",
)
replace_once(
    'src/server/analytics.js',
    """        adSlotViews: totalAdSlotViews,
        actualRevenueRial,
""",
    """        adSlotViews: totalAdSlotViews,
        adViewable: totalAdViewable,
        actualRevenueRial,
""",
)
replace_once(
    'src/server/analytics.js',
    """        fillRate: totalAdSlotViews ? (impressions / totalAdSlotViews) * 100 : 0,
""",
    """        fillRate: totalAdSlotViews ? (impressions / totalAdSlotViews) * 100 : 0,
        viewabilityRate: totalAdSlotViews ? (totalAdViewable / totalAdSlotViews) * 100 : 0,
""",
)
replace_once(
    'src/server/analytics.js',
    """      'exports', 'ad_slot_views', 'revenue_rial', 'impressions', 'clicks', 'search_clicks', 'search_impressions',
""",
    """      'exports', 'ad_slot_views', 'ad_viewable', 'revenue_rial', 'impressions', 'clicks', 'search_clicks', 'search_impressions',
""",
)

# ---------------------------------------------------------------------------
# Admin dashboard: editor inventory and pre-launch checklist.
# ---------------------------------------------------------------------------
replace_once(
    'public/analytics.html',
    '<section class="kpi-grid kpi-grid--6">\n            <article class="kpi-card" data-tone="pink"><span>درآمد</span>',
    '<section class="kpi-grid kpi-grid--8">\n            <article class="kpi-card" data-tone="pink"><span>درآمد</span>',
)
replace_once(
    'public/analytics.html',
    """            <article class="kpi-card"><span>Session RPM</span><strong id="metric-session-rpm">—</strong><small>درآمد به‌ازای هزار جلسه</small></article>
          </section>
""",
    """            <article class="kpi-card"><span>Session RPM</span><strong id="metric-session-rpm">—</strong><small>درآمد به‌ازای هزار جلسه</small></article>
            <article class="kpi-card" data-tone="violet"><span>فرصت قابل‌دیدن ادیتور</span><strong id="metric-editor-viewable">—</strong><small>Proxy داخلی؛ نه Impression قابل پرداخت</small></article>
            <article class="kpi-card" data-tone="green"><span>Viewability ادیتور</span><strong id="metric-editor-viewability">—</strong><small>۵۰٪ جایگاه برای حداقل یک ثانیه</small></article>
          </section>
""",
)
replace_once(
    'public/analytics.html',
    '<thead><tr><th>جایگاه</th><th>دیده‌شدن</th><th>لود</th><th>خطا</th><th>مسدود</th></tr></thead><tbody id="ad-slots-table"></tbody>',
    '<thead><tr><th>جایگاه</th><th>دیده‌شدن</th><th>قابل‌دیدن</th><th>Viewability</th><th>لود</th><th>خطا</th><th>مسدود</th></tr></thead><tbody id="ad-slots-table"></tbody>',
)
settings_anchor = """            <article class="panel span-5"><div class="panel-head"><div><h3>وضعیت داده و امنیت</h3><p>کنترل پایداری و تنظیمات محرمانهٔ پنل</p></div></div><div id="data-health-list" class="check-list"></div><div class="data-actions"><a class="a-button secondary" id="export-dashboard-secondary" href="/api/admin/analytics/export.csv">دانلود CSV تحلیلی</a><button class="a-button secondary" id="copy-backup-command" type="button">کپی فرمان Backup</button></div></article>
"""
settings_new = settings_anchor + """            <article class="panel span-12 launch-readiness-panel"><div class="panel-head"><div><h3>آمادگی انتشار رسمی</h3><p>بررسی دامنه، دیسک، آنالیتیکس، Search Console و ایزولاسیون تبلیغ ادیتور</p></div><span id="launch-readiness-badge" class="panel-tag">در حال بررسی</span></div><div class="launch-readiness-layout"><div class="launch-score"><strong id="launch-readiness-score">—</strong><span>از ۱۰۰</span><small id="launch-readiness-summary">—</small></div><div id="launch-readiness-list" class="check-list"></div></div></article>
"""
replace_once('public/analytics.html', settings_anchor, settings_new)

replace_once(
    'public/js/analytics-dashboard.js',
    'let health = null;\nlet currentView',
    'let health = null;\nlet launchReadiness = null;\nlet currentView',
)
replace_once(
    'public/js/analytics-dashboard.js',
    """function renderAdSlots(rows) {
  const body = $('#ad-slots-table');
  body.innerHTML = rows?.length ? rows.map((row) => `<tr><td>${escapeHtml(row.name)}</td><td class="number">${formatNumber(row.views)}</td><td class="number">${formatNumber(row.loaded)}</td><td class="number">${formatNumber(row.errors)}</td><td class="number">${formatNumber(row.blocked)}</td></tr>`).join('') : emptyRows(5, 'تبلیغات هنوز فعال نشده یا جایگاهی دیده نشده است.');
}
""",
    """function renderAdSlots(rows) {
  const body = $('#ad-slots-table');
  body.innerHTML = rows?.length ? rows.map((row) => {
    const viewability = Number(row.views) ? Number(row.viewable || 0) / Number(row.views) * 100 : 0;
    return `<tr><td>${escapeHtml(row.name)}</td><td class="number">${formatNumber(row.views)}</td><td class="number">${formatNumber(row.viewable)}</td><td class="number">${formatPercent(viewability)}</td><td class="number">${formatNumber(row.loaded)}</td><td class="number">${formatNumber(row.errors)}</td><td class="number">${formatNumber(row.blocked)}</td></tr>`;
  }).join('') : emptyRows(7, 'تبلیغات هنوز فعال نشده یا جایگاهی دیده نشده است.');
}

function renderLaunchReadiness(report) {
  const score = Number(report?.score);
  $('#launch-readiness-score').textContent = Number.isFinite(score) ? formatNumber(score) : '—';
  $('#launch-readiness-summary').textContent = report?.summary || 'گزارش آمادگی در دسترس نیست.';
  const badge = $('#launch-readiness-badge');
  badge.textContent = report?.ready ? `آماده · ${report.grade}` : `${formatNumber(report?.counts?.blockers || 0)} مانع`;
  badge.classList.toggle('is-ready', Boolean(report?.ready));
  const list = $('#launch-readiness-list');
  list.innerHTML = (report?.checks || []).map((item) => `<div class="check-item ${item.status === 'blocker' ? 'fail' : item.status}"><div><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.detail)}</small><em>${escapeHtml(item.action)}</em></div></div>`).join('') || '<div class="empty-row">گزارش آمادگی موجود نیست.</div>';
}
""",
)
replace_once(
    'public/js/analytics-dashboard.js',
    """  $('#metric-session-rpm').textContent = formatRial(rates.sessionRpmRial, true);
  renderRevenueBreakdown(summary);
""",
    """  $('#metric-session-rpm').textContent = formatRial(rates.sessionRpmRial, true);
  const editorSlots = (summary.adSlots || []).filter((row) => String(row.name).startsWith('editor'));
  const editorViews = editorSlots.reduce((sum, row) => sum + Number(row.views || 0), 0);
  const editorViewable = editorSlots.reduce((sum, row) => sum + Number(row.viewable || 0), 0);
  $('#metric-editor-viewable').textContent = formatNumber(editorViewable);
  $('#metric-editor-viewability').textContent = formatPercent(editorViews ? editorViewable / editorViews * 100 : 0);
  renderRevenueBreakdown(summary);
""",
)
replace_once(
    'public/js/analytics-dashboard.js',
    """  renderAudit(auditEntries);
  renderDataHealth();
""",
    """  renderAudit(auditEntries);
  renderDataHealth();
  renderLaunchReadiness(launchReadiness);
""",
)
replace_once(
    'public/js/analytics-dashboard.js',
    """    const [growth, audits, integrationStatus, goals, serviceHealth] = await Promise.all([
      api(`/api/admin/growth/overview?${query}`),
      api('/api/admin/seo/audits?limit=40'),
      api('/api/admin/integrations/status'),
      api('/api/admin/goals'),
      api('/api/health'),
    ]);
""",
    """    const [growth, audits, integrationStatus, goals, serviceHealth, readiness] = await Promise.all([
      api(`/api/admin/growth/overview?${query}`),
      api('/api/admin/seo/audits?limit=40'),
      api('/api/admin/integrations/status'),
      api('/api/admin/goals'),
      api('/api/health'),
      api('/api/admin/launch/readiness'),
    ]);
""",
)
replace_once(
    'public/js/analytics-dashboard.js',
    """    health = serviceHealth;
    populateGoals(goals);
""",
    """    health = serviceHealth;
    launchReadiness = readiness;
    populateGoals(goals);
""",
)

append_before(
    'public/css/analytics.css',
    '@media (max-width: 1500px) {',
    """
.launch-readiness-layout { display: grid; grid-template-columns: 180px minmax(0, 1fr); gap: 18px; align-items: start; }
.launch-score { min-height: 180px; padding: 22px; display: grid; place-items: center; align-content: center; border: 1px solid var(--a-border); border-radius: 16px; background: var(--a-panel-2); text-align: center; }
.launch-score strong { direction: ltr; font-size: 43px; }
.launch-score span { color: var(--a-muted); font-size: 9px; }
.launch-score small { margin-top: 12px; color: var(--a-muted); line-height: 1.75; font-size: 9px; }
#launch-readiness-list { grid-template-columns: repeat(2, minmax(0, 1fr)); }
#launch-readiness-list .check-item em { display: block; margin-top: 5px; color: var(--a-info); font-style: normal; font-size: 8px; line-height: 1.6; }
#launch-readiness-badge.is-ready { border-color: rgba(67,216,164,.4); color: var(--a-success); }
@media (max-width: 760px) { .launch-readiness-layout { grid-template-columns: 1fr; } #launch-readiness-list { grid-template-columns: 1fr; } }

""",
)

# ---------------------------------------------------------------------------
# Legal copy and public promise: precise disclosure of editor advertising.
# ---------------------------------------------------------------------------
privacy = ROOT / 'public/privacy.html'
text = privacy.read_text(encoding='utf-8')
text = text.replace('سیاست حریم خصوصی، تحلیل first-party و تبلیغات Mermaid Studio', 'سیاست حریم خصوصی، تحلیل first-party و تبلیغات نمودارا')
text = text.replace('حریم خصوصی | Mermaid Studio', 'حریم خصوصی | نمودارا')
text = text.replace('Mermaid Studio با رویکرد', 'نمودارا با رویکرد')
text = text.replace('آخرین به‌روزرسانی: ۲۲ تیر ۱۴۰۵', 'آخرین به‌روزرسانی: ۲۵ تیر ۱۴۰۵')
text = text.replace(
    'تبلیغات فقط در صفحات محتوایی مانند خانه، قالب‌ها و آموزش نمایش داده می‌شوند. ادیتور و رندرکنندهٔ headless اسکریپت تبلیغاتی بارگذاری نمی‌کنند. شبکهٔ ناشر ممکن است براساس سیاست خودش IP، مرورگر، شناسه‌های تبلیغاتی یا Cookie را برای تحویل، شمارش، جلوگیری از تقلب و گزارش تبلیغ پردازش کند.',
    'تبلیغات در صفحات محتوایی و، در صورت فعال‌سازی جداگانه، در جایگاه‌های مشخص ادیتور نمایش داده می‌شوند. تبلیغ ادیتور داخل Frame با Origin جداگانه بارگذاری می‌شود تا اسکریپت ناشر به DOM ادیتور، CodeMirror و متن Mermaid دسترسی نداشته باشد. شبکهٔ ناشر همچنان ممکن است براساس سیاست خودش IP، مرورگر، شناسه‌های تبلیغاتی یا Cookie را برای تحویل، شمارش، جلوگیری از تقلب و گزارش تبلیغ پردازش کند.',
)
text = text.replace(
    'تا زمانی که اطلاعات معتبر پنل ناشر و گزینهٔ فعال‌سازی تنظیم نشده باشد، هیچ درخواست تبلیغاتی شخص ثالث ارسال نمی‌شود. جایگاه‌ها با برچسب «تبلیغات» مشخص‌اند و پاپ‌آپ یا کلیک اجباری استفاده نمی‌شود.',
    'تا زمانی که اطلاعات معتبر پنل ناشر، شناسهٔ جایگاه و گزینهٔ فعال‌سازی تنظیم نشده باشد، هیچ درخواست تبلیغاتی شخص ثالث ارسال نمی‌شود. برای ادیتور، Origin جداگانه نیز شرط فعال‌شدن است. جایگاه‌ها با برچسب «تبلیغات» مشخص‌اند و پاپ‌آپ، Refresh خودکار، کلیک اجباری یا تبلیغ روی دکمه‌های خروجی استفاده نمی‌شود.',
)
privacy.write_text(text, encoding='utf-8')

replace_once(
    'public/landing.html',
    'کد نمودار برای تحلیل رفتار ذخیره نمی‌شود و در محیط ادیتور هیچ اسکریپت تبلیغاتی شخص ثالثی بارگذاری نمی‌کنیم.',
    'کد نمودار برای تحلیل رفتار ذخیره نمی‌شود. اگر تبلیغ ادیتور فعال باشد، در Frame جداگانه و بدون دسترسی به DOM کد بارگذاری می‌شود.',
)
replace_once(
    'public/landing.html',
    '<div><dt>تبلیغ در ادیتور</dt><dd>وجود ندارد</dd></div>',
    '<div><dt>تبلیغ در ادیتور</dt><dd>جدا از محیط کد</dd></div>',
)
terms = ROOT / 'public/terms.html'
terms_text = terms.read_text(encoding='utf-8')
terms_text = terms_text.replace('شرایط استفاده از Mermaid Studio', 'شرایط استفاده از نمودارا')
terms_text = terms_text.replace('شرایط استفاده | Mermaid Studio', 'شرایط استفاده | نمودارا')
terms_text = terms_text.replace('نسخهٔ آنلاین Mermaid Studio', 'نسخهٔ آنلاین نمودارا')
terms_text = terms_text.replace(
    'نسخهٔ عمومی Mermaid Studio بدون فروش اشتراک یا قابلیت پولی ارائه می‌شود و هزینه‌های آن از تبلیغات مشخص‌شده در صفحات محتوایی تأمین می‌شود. استفاده از مسدودکنندهٔ تبلیغ مانع دسترسی به قابلیت‌های اصلی ادیتور نخواهد شد.',
    'نسخهٔ عمومی نمودارا بدون فروش اشتراک یا قابلیت پولی ارائه می‌شود و هزینه‌های آن از جایگاه‌های مشخص تبلیغاتی در صفحات محتوا و ادیتور تأمین می‌شود. تبلیغ ادیتور از محیط کد جداست و استفاده از مسدودکنندهٔ تبلیغ مانع دسترسی به قابلیت‌های اصلی نخواهد شد.',
)
terms.write_text(terms_text, encoding='utf-8')

# ---------------------------------------------------------------------------
# Environment, version, scripts and docs.
# ---------------------------------------------------------------------------
env_path = ROOT / '.env.example'
env = env_path.read_text(encoding='utf-8')
editor_env = """
# Optional editor monetization. Use a second origin on the same deployment so
# publisher scripts cannot access the editor DOM or Mermaid source.
ADS_EDITOR_ENABLED=false
ADS_EDITOR_REQUIRE_CROSS_ORIGIN=true
ADS_EDITOR_FRAME_ORIGIN=https://ads.nemodara.ir
ADS_SLOT_EDITOR_RAIL=
ADS_SLOT_EDITOR_DOCK=
"""
if 'ADS_EDITOR_ENABLED=' not in env:
    anchor = 'ADS_SLOT_ARTICLE_END=\n'
    if anchor not in env:
        raise SystemExit('Advertising env anchor not found')
    env = env.replace(anchor, anchor + editor_env, 1)
env_path.write_text(env, encoding='utf-8')

package_path = ROOT / 'package.json'
package = json.loads(package_path.read_text(encoding='utf-8'))
package['version'] = '1.8.0'
package['description'] = 'Nemodara: a launch-ready Persian Mermaid editor with cross-origin isolated editor ads, revenue analytics and deep technical SEO.'
checks = [
    'public/js/editor-ads.js',
    'src/server/launch-readiness.js',
]
for file in checks:
    token = f'node --check {file}'
    if token not in package['scripts']['check']:
        package['scripts']['check'] += f' && {token}'
if 'tests/editor-ads-launch.test.mjs' not in package['scripts']['test:product']:
    package['scripts']['test:product'] = package['scripts']['test:product'].replace('tests/product-growth-v3.test.mjs', 'tests/product-growth-v3.test.mjs tests/editor-ads-launch.test.mjs')
package['scripts']['test:editor-ads'] = 'node --test tests/editor-ads-launch.test.mjs'
for keyword in ['editor-ads', 'cross-origin-isolation', 'ad-viewability', 'launch-readiness']:
    if keyword not in package.setdefault('keywords', []):
        package['keywords'].append(keyword)
package_path.write_text(json.dumps(package, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

lock_path = ROOT / 'package-lock.json'
lock = json.loads(lock_path.read_text(encoding='utf-8'))
lock['version'] = '1.8.0'
if '' in lock.get('packages', {}):
    lock['packages']['']['version'] = '1.8.0'
lock_path.write_text(json.dumps(lock, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

readme = ROOT / 'README_FA.md'
readme_text = readme.read_text(encoding='utf-8')
addition = """
## درآمدزایی از بازدید ادیتور

نسخهٔ Production می‌تواند دو جایگاه تبلیغاتی مستقل در ادیتور داشته باشد: ستون کنار ادیتور در نمایشگر عریض و نوار زیر محیط کار در موبایل و لپ‌تاپ. Publisher Script در Origin جداگانهٔ `ads.nemodara.ir` اجرا می‌شود و به متن Mermaid دسترسی ندارد. راهنمای کامل در [`docs/EDITOR_ADS_FA.md`](docs/EDITOR_ADS_FA.md) قرار دارد.

پنل `/admin/analytics` علاوه بر Viewability جایگاه‌های ادیتور، یک چک‌لیست آمادگی انتشار برای دامنه، دیسک، آنالیتیکس، تبلیغات و Search Console نمایش می‌دهد.

"""
marker = '## انتشار نهایی با Docker Compose\n'
if addition.strip() not in readme_text:
    if marker not in readme_text:
        raise SystemExit('README deployment marker not found')
    readme_text = readme_text.replace(marker, addition + marker, 1)
readme.write_text(readme_text, encoding='utf-8')

print('Editor monetization and launch-readiness integration applied.')
