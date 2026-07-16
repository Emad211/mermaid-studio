#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path.cwd()


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


def write(path: str, value: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(value, encoding='utf-8')


def replace_once(path: str, old: str, new: str) -> None:
    text = read(path)
    if new in text:
        return
    if old not in text:
        raise SystemExit(f'Expected block not found in {path}: {old[:180]!r}')
    write(path, text.replace(old, new, 1))


def regex_once(path: str, pattern: str, replacement: str) -> None:
    text = read(path)
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.MULTILINE | re.DOTALL)
    if count != 1:
        raise SystemExit(f'Expected regex did not match exactly once in {path}: {pattern[:160]!r} ({count})')
    write(path, updated)


# ---------------------------------------------------------------------------
# Express: public caching, CSRF protection and privacy-safe GET rendering.
# ---------------------------------------------------------------------------
app_path = 'src/server/app.js'
app = read(app_path)

old_cache = """function sendHtmlSource(req, res, source, options, state) {
  const prepared = prepareHtml(req, source, options, state);
  res.setHeader('Content-Security-Policy', contentSecurityPolicy(req, state.environment, prepared.hashes));
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Language', 'fa-IR');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
"""
new_cache = """function sendHtmlSource(req, res, source, options, state) {
  const prepared = prepareHtml(req, source, options, state);
  const privateDocument = req.path === '/editor' || req.path === '/headless' || req.path.startsWith('/admin/');
  res.setHeader('Content-Security-Policy', contentSecurityPolicy(req, state.environment, prepared.hashes));
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Language', 'fa-IR');
  res.setHeader('Cache-Control', privateDocument
    ? 'no-store, max-age=0'
    : 'public, max-age=0, s-maxage=300, stale-while-revalidate=86400');
"""
if new_cache not in app:
    if old_cache not in app:
        raise SystemExit('sendHtmlSource cache block not found')
    app = app.replace(old_cache, new_cache, 1)

for old, new in [
    ("app.post('/api/admin/analytics/revenue', adminLimit, adminAuth, express.json", "app.post('/api/admin/analytics/revenue', adminLimit, adminAuth, requireSameOrigin, express.json"),
    ("app.delete('/api/admin/analytics/revenue/:id', adminLimit, adminAuth, async", "app.delete('/api/admin/analytics/revenue/:id', adminLimit, adminAuth, requireSameOrigin, async"),
    ("app.post('/api/admin/analytics/search', adminLimit, adminAuth, express.json", "app.post('/api/admin/analytics/search', adminLimit, adminAuth, requireSameOrigin, express.json"),
]:
    if new not in app:
        if old not in app:
            raise SystemExit(f'Admin route anchor not found: {old}')
        app = app.replace(old, new, 1)

# Restrict the editor advertising document to genuine iframe navigations from
# the primary site in production. Test and development keep curl-based checks.
frame_anchor = """  app.get('/ads/editor-frame', (req, res, next) => {
    try {
"""
frame_replacement = """  app.get('/ads/editor-frame', (req, res, next) => {
    try {
      if (environment.NODE_ENV === 'production') {
        const destination = String(req.get('Sec-Fetch-Dest') || '').toLowerCase();
        const fetchSite = String(req.get('Sec-Fetch-Site') || '').toLowerCase();
        let referrerOrigin = '';
        try { referrerOrigin = new URL(String(req.get('Referer') || '')).origin; } catch { /* ignored */ }
        const expectedOrigin = safeHttpsOrigin(environment.SITE_URL);
        if (destination !== 'iframe' || !['same-site', 'same-origin'].includes(fetchSite) || !expectedOrigin || referrerOrigin !== expectedOrigin) {
          throw new HttpError(403, 'EDITOR_AD_FRAME_FORBIDDEN', 'The advertising frame must be embedded by the primary editor.');
        }
      }
"""
if frame_replacement not in app:
    if frame_anchor not in app:
        raise SystemExit('Editor frame route anchor not found')
    app = app.replace(frame_anchor, frame_replacement, 1)

# Disable query-string Mermaid rendering in production unless explicitly
# enabled. This avoids source code appearing in browser/proxy/access logs.
if 'function requireRenderGetEnabled' not in app:
    marker = "function analyticsTracked(pathname) {"
    helper = """function requireRenderGetEnabled(req, _res, next) {
  const enabled = envBoolean(req.app.locals.environment || process.env, 'RENDER_GET_ENABLED');
  if (enabled || (req.app.locals.environment || process.env).NODE_ENV !== 'production') return next();
  return next(new HttpError(405, 'RENDER_GET_DISABLED', 'Use POST /api/render so Mermaid source is not placed in a URL.'));
}

"""
    if marker not in app:
        raise SystemExit('Render GET helper marker not found')
    app = app.replace(marker, helper + marker, 1)

# Expose the environment through app.locals for the guard without globals.
state_anchor = """  app.locals.analytics = state.analytics;
  app.locals.seo = state.seo;
"""
state_new = """  app.locals.analytics = state.analytics;
  app.locals.seo = state.seo;
  app.locals.environment = environment;
"""
if state_new not in app:
    if state_anchor not in app:
        raise SystemExit('app.locals state anchor not found')
    app = app.replace(state_anchor, state_new, 1)

# Match either the existing direct GET handler or one that already has rate
# limiting. Add the privacy guard once.
if "app.get('/api/render', requireRenderGetEnabled" not in app:
    app, count = re.subn(
        r"app\.get\('/api/render',\s*",
        "app.get('/api/render', requireRenderGetEnabled, ",
        app,
        count=1,
    )
    if count != 1:
        raise SystemExit('GET /api/render route not found')

write(app_path, app)

# ---------------------------------------------------------------------------
# Browser analytics: distinguish loaded, rendered and viewable inventory.
# ---------------------------------------------------------------------------
analytics_browser = read('public/js/analytics.js')
analytics_browser = analytics_browser.replace(
    "    loaded: 'ad_script_loaded',\n    viewable: 'ad_viewable',",
    "    loaded: 'ad_script_loaded',\n    rendered: 'ad_rendered',\n    viewable: 'ad_viewable',",
)
analytics_browser = analytics_browser.replace(
    "'template_open', 'ad_slot_view', 'ad_viewable', 'ad_script_loaded', 'ad_script_error', 'ad_blocked',",
    "'template_open', 'ad_slot_view', 'ad_viewable', 'ad_rendered', 'ad_script_loaded', 'ad_script_error', 'ad_blocked',",
)

# Replace the one-shot 25% observer with view + one-second/50% visibility.
old_observer_pattern = r"function observeAdSlots\(\) \{.*?\n\}\n\nwindow\.addEventListener\('mstudio:ad'"
new_observer = """function observeAdSlots() {
  const slots = [...document.querySelectorAll('[data-ad-slot]')];
  if (!slots.length || !('IntersectionObserver' in window)) return;
  const viewed = new WeakSet();
  const viewable = new WeakSet();
  const timers = new WeakMap();
  const cancel = (slot) => {
    const timer = timers.get(slot);
    if (timer) clearTimeout(timer);
    timers.delete(slot);
  };
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const slot = entry.target;
      const name = slot.dataset.adSlot || 'unknown';
      if (entry.isIntersecting && entry.intersectionRatio >= 0.25 && !viewed.has(slot)) {
        viewed.add(slot);
        send('ad_slot_view', { slot: name });
      }
      const eligible = entry.isIntersecting && entry.intersectionRatio >= 0.5 && document.visibilityState === 'visible';
      if (!eligible) {
        cancel(slot);
        continue;
      }
      if (viewable.has(slot) || timers.has(slot)) continue;
      timers.set(slot, setTimeout(() => {
        timers.delete(slot);
        if (document.visibilityState !== 'visible' || viewable.has(slot)) return;
        viewable.add(slot);
        send('ad_viewable', { slot: name });
      }, 1_000));
    }
  }, { threshold: [0, 0.25, 0.5, 1] });
  slots.forEach((slot) => observer.observe(slot));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') slots.forEach(cancel);
  });
}

window.addEventListener('mstudio:ad'"""
if 'const viewable = new WeakSet();' not in analytics_browser:
    analytics_browser, count = re.subn(old_observer_pattern, new_observer, analytics_browser, count=1, flags=re.DOTALL)
    if count != 1:
        raise SystemExit('Browser ad observer block not found')
write('public/js/analytics.js', analytics_browser)

# ---------------------------------------------------------------------------
# Editor frame: report a real rendered placement, not only JS download.
# ---------------------------------------------------------------------------
ads = read('src/server/ads.js')
old_load = """        script.addEventListener('load', () => {
          mount.dataset.ready = 'true';
          report('loaded');
        }, { once: true });
"""
new_load = """        let rendered = false;
        const reportRendered = () => {
          if (rendered || !mount.childNodes.length) return;
          rendered = true;
          mount.dataset.ready = 'true';
          report('rendered');
          observer.disconnect();
        };
        const observer = new MutationObserver(reportRendered);
        observer.observe(mount, { childList: true, subtree: true });
        script.addEventListener('load', () => {
          report('loaded');
          reportRendered();
        }, { once: true });
"""
if new_load not in ads:
    if old_load not in ads:
        raise SystemExit('Editor frame script load block not found')
    ads = ads.replace(old_load, new_load, 1)
write('src/server/ads.js', ads)

editor_ads = read('public/js/editor-ads.js')
editor_ads = editor_ads.replace(
    "if (!['loaded', 'blocked', 'error'].includes(message.type)) return;",
    "if (!['loaded', 'rendered', 'blocked', 'error'].includes(message.type)) return;",
)
write('public/js/editor-ads.js', editor_ads)

# ---------------------------------------------------------------------------
# Server analytics: persist rendered inventory separately from impressions.
# ---------------------------------------------------------------------------
server_analytics = read('src/server/analytics.js')
server_analytics = server_analytics.replace(
    "  'ad_viewable',\n  'ad_script_loaded',",
    "  'ad_viewable',\n  'ad_rendered',\n  'ad_script_loaded',",
)
server_analytics = server_analytics.replace(
    "{ views: 0, viewable: 0, loaded: 0, errors: 0, blocked: 0 }",
    "{ views: 0, viewable: 0, rendered: 0, loaded: 0, errors: 0, blocked: 0 }",
)
server_analytics = server_analytics.replace(
    "if (payload.event === 'ad_viewable') data.adSlots[payload.slot].viewable += 1;\n        if (payload.event === 'ad_script_loaded')",
    "if (payload.event === 'ad_viewable') data.adSlots[payload.slot].viewable += 1;\n        if (payload.event === 'ad_rendered') data.adSlots[payload.slot].rendered += 1;\n        if (payload.event === 'ad_script_loaded')",
)
server_analytics = server_analytics.replace(
    "adViewable: Object.values(value.adSlots || {}).reduce((sum, stats) => sum + finite(stats.viewable), 0),",
    "adViewable: Object.values(value.adSlots || {}).reduce((sum, stats) => sum + finite(stats.viewable), 0),\n          adRendered: Object.values(value.adSlots || {}).reduce((sum, stats) => sum + finite(stats.rendered), 0),",
)
server_analytics = server_analytics.replace(
    "const totalAdViewable = Object.values(adSlots).reduce((sum, stats) => sum + finite(stats.viewable), 0);",
    "const totalAdViewable = Object.values(adSlots).reduce((sum, stats) => sum + finite(stats.viewable), 0);\n    const totalAdRendered = Object.values(adSlots).reduce((sum, stats) => sum + finite(stats.rendered), 0);",
)
server_analytics = server_analytics.replace(
    "adViewable: totalAdViewable,\n        actualRevenueRial,",
    "adViewable: totalAdViewable,\n        adRendered: totalAdRendered,\n        actualRevenueRial,",
)
write('src/server/analytics.js', server_analytics)

# ---------------------------------------------------------------------------
# Broken links and dead editor selector.
# ---------------------------------------------------------------------------
for file in ['public/landing.html', 'src/server/article-content.js', 'src/server/learn-content.js']:
    path = ROOT / file
    if not path.exists():
        continue
    text = path.read_text(encoding='utf-8')
    text = text.replace('/articles/architecture-documentation-that-lasts', '/articles/architecture-diagram-that-stays-useful')
    text = text.replace('/learn/erd-mermaid', '/learn/er-diagram-mermaid')
    path.write_text(text, encoding='utf-8')

editor_experience = read('public/js/editor-experience.js')
# Remove only an optional dead listener; help remains available through the
# learning navigation and command palette.
editor_experience = re.sub(r"\n?\s*document\.querySelector\('#btn-help'\)\?\.addEventListener\([^;]+;", '', editor_experience, count=1)
write('public/js/editor-experience.js', editor_experience)

# ---------------------------------------------------------------------------
# Configuration, version and test registration.
# ---------------------------------------------------------------------------
env = read('.env.example')
if 'RENDER_GET_ENABLED=' not in env:
    marker = 'JSON_BODY_LIMIT=256kb\n'
    if marker not in env:
        raise SystemExit('JSON_BODY_LIMIT env anchor not found')
    env = env.replace(marker, marker + '# Keep Mermaid source out of URLs and access logs in production.\nRENDER_GET_ENABLED=false\n', 1)
write('.env.example', env)

package_path = ROOT / 'package.json'
package = json.loads(package_path.read_text(encoding='utf-8'))
package['version'] = '1.8.1'
package['description'] = 'Nemodara: a security-hardened Persian Mermaid editor with isolated monetization, reliable analytics and technical SEO.'
if 'tests/deep-audit-hardening.test.mjs' not in package['scripts']['test:product']:
    package['scripts']['test:product'] = package['scripts']['test:product'].replace(
        'tests/editor-ads-launch.test.mjs',
        'tests/editor-ads-launch.test.mjs tests/deep-audit-hardening.test.mjs',
    )
package['scripts']['test:audit-hardening'] = 'node --test tests/deep-audit-hardening.test.mjs'
write('package.json', json.dumps(package, ensure_ascii=False, indent=2) + '\n')

print('Deep audit hardening patch applied.')
