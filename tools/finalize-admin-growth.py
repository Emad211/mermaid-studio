#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path.cwd()


def replace_once(path: str, old: str, new: str) -> None:
    file = ROOT / path
    text = file.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'Expected block not found in {path}: {old[:120]!r}')
    text = text.replace(old, new, 1)
    file.write_text(text, encoding='utf-8')


def append_once(path: str, marker: str, content: str) -> None:
    file = ROOT / path
    text = file.read_text(encoding='utf-8')
    if content.strip() in text:
        return
    if marker not in text:
        raise SystemExit(f'Marker not found in {path}: {marker!r}')
    text = text.replace(marker, marker + content, 1)
    file.write_text(text, encoding='utf-8')


# --- Analytics: unique product funnel and page-level conversion attribution ---
replace_once(
    'src/server/analytics.js',
    """      engagementSeconds: 0,
      bots: 0,
    },
    unique: { sessions: [], visitors: [], engagedSessions: [] },
""",
    """      engagementSeconds: 0,
      editorSessions: 0,
      renderSessions: 0,
      exportSessions: 0,
      shareSessions: 0,
      bots: 0,
    },
    unique: {
      sessions: [],
      visitors: [],
      engagedSessions: [],
      editorSessions: [],
      renderSessions: [],
      exportSessions: [],
      shareSessions: [],
    },
""",
)

replace_once(
    'src/server/analytics.js',
    """    _sessionSet: { value: new Set(merged.unique.sessions || []), enumerable: false },
    _visitorSet: { value: new Set(merged.unique.visitors || []), enumerable: false },
    _engagedSet: { value: new Set(merged.unique.engagedSessions || []), enumerable: false },
""",
    """    _sessionSet: { value: new Set(merged.unique.sessions || []), enumerable: false },
    _visitorSet: { value: new Set(merged.unique.visitors || []), enumerable: false },
    _engagedSet: { value: new Set(merged.unique.engagedSessions || []), enumerable: false },
    _editorSet: { value: new Set(merged.unique.editorSessions || []), enumerable: false },
    _renderSet: { value: new Set(merged.unique.renderSessions || []), enumerable: false },
    _exportSet: { value: new Set(merged.unique.exportSessions || []), enumerable: false },
    _shareSet: { value: new Set(merged.unique.shareSessions || []), enumerable: false },
""",
)

replace_once(
    'src/server/analytics.js',
    """function hashIdentifier(secret, day, value) {
""",
    """function ensurePage(pages, pathname) {
  pages[pathname] ||= {
    pageviews: 0,
    sessions: 0,
    engagementSeconds: 0,
    editorOpens: 0,
    adSlotViews: 0,
  };
  return pages[pathname];
}

function markUnique(data, setName, arrayName, totalName, hash) {
  const set = data[setName];
  if (set.has(hash)) return false;
  if (set.size < MAX_UNIQUE_PER_DAY) {
    set.add(hash);
    data.unique[arrayName].push(hash);
  }
  data.totals[totalName] += 1;
  return true;
}

function hashIdentifier(secret, day, value) {
""",
)

replace_once(
    'src/server/analytics.js',
    """      increment(data.events, payload.event);

      if (payload.event === 'page_view') {
""",
    """      increment(data.events, payload.event);

      if (payload.event === 'editor_open') {
        ensurePage(data.pages, payload.path).editorOpens += 1;
        markUnique(data, '_editorSet', 'editorSessions', 'editorSessions', sessionHash);
      }
      if (payload.event === 'render_success') {
        markUnique(data, '_renderSet', 'renderSessions', 'renderSessions', sessionHash);
      }
      if (payload.event === 'share') {
        markUnique(data, '_shareSet', 'shareSessions', 'shareSessions', sessionHash);
      }

      if (payload.event === 'page_view') {
""",
)

replace_once(
    'src/server/analytics.js',
    """        data.totals.pageviews += 1;
        data.pages[payload.path] ||= { pageviews: 0, sessions: 0, engagementSeconds: 0 };
        data.pages[payload.path].pageviews += 1;
""",
    """        data.totals.pageviews += 1;
        const page = ensurePage(data.pages, payload.path);
        page.pageviews += 1;
""",
)
replace_once('src/server/analytics.js', '          data.pages[payload.path].sessions += 1;\n', '          page.sessions += 1;\n')
replace_once(
    'src/server/analytics.js',
    """        data.totals.engagementSeconds += payload.seconds;
        data.pages[payload.path] ||= { pageviews: 0, sessions: 0, engagementSeconds: 0 };
        data.pages[payload.path].engagementSeconds += payload.seconds;
""",
    """        data.totals.engagementSeconds += payload.seconds;
        ensurePage(data.pages, payload.path).engagementSeconds += payload.seconds;
""",
)
replace_once(
    'src/server/analytics.js',
    """      if (payload.event === 'export' && EXPORT_FORMATS.has(payload.format)) {
        increment(data.exports, payload.format === 'jpeg' ? 'jpg' : payload.format);
      }
""",
    """      if (payload.event === 'export' && EXPORT_FORMATS.has(payload.format)) {
        increment(data.exports, payload.format === 'jpeg' ? 'jpg' : payload.format);
        markUnique(data, '_exportSet', 'exportSessions', 'exportSessions', sessionHash);
      }
""",
)
replace_once(
    'src/server/analytics.js',
    """        if (payload.event === 'ad_slot_view') data.adSlots[payload.slot].views += 1;
""",
    """        if (payload.event === 'ad_slot_view') {
          data.adSlots[payload.slot].views += 1;
          ensurePage(data.pages, payload.path).adSlotViews += 1;
        }
""",
)

replace_once(
    'src/server/analytics.js',
    """    const totals = { pageviews: 0, sessions: 0, visitors: 0, engagedSessions: 0, engagementSeconds: 0, bots: 0 };
""",
    """    const totals = {
      pageviews: 0,
      sessions: 0,
      visitors: 0,
      engagedSessions: 0,
      engagementSeconds: 0,
      editorSessions: 0,
      renderSessions: 0,
      exportSessions: 0,
      shareSessions: 0,
      bots: 0,
    };
""",
)
replace_once(
    'src/server/analytics.js',
    """        engagementSeconds: 0,
        exports: 0,
""",
    """        engagementSeconds: 0,
        editorSessions: 0,
        renderSessions: 0,
        exportSessions: 0,
        shareSessions: 0,
        exports: 0,
""",
)
replace_once(
    'src/server/analytics.js',
    """          pages[page] ||= { pageviews: 0, sessions: 0, engagementSeconds: 0 };
          pages[page].pageviews += finite(stats.pageviews);
          pages[page].sessions += finite(stats.sessions);
          pages[page].engagementSeconds += finite(stats.engagementSeconds);
""",
    """          pages[page] ||= { pageviews: 0, sessions: 0, engagementSeconds: 0, editorOpens: 0, adSlotViews: 0 };
          pages[page].pageviews += finite(stats.pageviews);
          pages[page].sessions += finite(stats.sessions);
          pages[page].engagementSeconds += finite(stats.engagementSeconds);
          pages[page].editorOpens += finite(stats.editorOpens);
          pages[page].adSlotViews += finite(stats.adSlotViews);
""",
)
replace_once(
    'src/server/analytics.js',
    """          engagementSeconds: finite(value.totals.engagementSeconds),
          exports: Object.values(value.exports || {}).reduce((sum, number) => sum + finite(number), 0),
""",
    """          engagementSeconds: finite(value.totals.engagementSeconds),
          editorSessions: finite(value.totals.editorSessions),
          renderSessions: finite(value.totals.renderSessions),
          exportSessions: finite(value.totals.exportSessions),
          shareSessions: finite(value.totals.shareSessions),
          exports: Object.values(value.exports || {}).reduce((sum, number) => sum + finite(number), 0),
""",
)
replace_once(
    'src/server/analytics.js',
    """        editorOpenRate: totals.sessions ? (finite(events.editor_open) / totals.sessions) * 100 : 0,
""",
    """        editorOpenRate: totals.sessions ? (finite(totals.editorSessions) / totals.sessions) * 100 : 0,
""",
)

# --- Express application: protected admin APIs and integrations ---
replace_once(
    'src/server/app.js',
    """import { AnalyticsError, createAnalyticsService } from './analytics.js';
""",
    """import { AnalyticsError, createAnalyticsService } from './analytics.js';
import { createAdminStore } from './admin-store.js';
import { buildGrowthReport, previousRange } from './growth-insights.js';
import { runSeoAudit } from './seo-audit.js';
import { searchConsoleConfig, syncSearchConsole } from './search-console.js';
import { indexNowConfig, submitIndexNow } from './indexnow.js';
""",
)
replace_once(
    'src/server/app.js',
    """  if (error instanceof HttpError || error instanceof AnalyticsError) return error;
""",
    """  if (error instanceof HttpError || error instanceof AnalyticsError) return error;
  if (Number.isInteger(error?.status) && error?.code) {
    return new HttpError(error.status, error.code, error.message || 'The request could not be completed.');
  }
""",
)
replace_once(
    'src/server/app.js',
    """function noTrackRequest(req, analytics) {
""",
    """function requireSameOrigin(req, _res, next) {
  const fetchSite = String(req.get('Sec-Fetch-Site') || '').toLowerCase();
  if (fetchSite === 'cross-site') {
    return next(new HttpError(403, 'CROSS_SITE_ADMIN_REQUEST', 'Cross-site admin mutations are not allowed.'));
  }
  const origin = req.get('Origin');
  if (!origin) return next();
  const expected = `${req.protocol}://${req.get('host')}`;
  if (origin !== expected) {
    return next(new HttpError(403, 'ORIGIN_MISMATCH', 'The request origin does not match this site.'));
  }
  return next();
}

function noTrackRequest(req, analytics) {
""",
)
replace_once(
    'src/server/app.js',
    """  const state = {
    environment,
    seo: seoConfig(environment),
    analytics: createAnalyticsService({ env: environment, logger }),
  };
  app.locals.analytics = state.analytics;
  app.locals.seo = state.seo;
""",
    """  const analytics = createAnalyticsService({ env: environment, logger });
  const state = {
    environment,
    seo: seoConfig(environment),
    analytics,
    adminStore: createAdminStore({ dataDir: analytics.config.dataDir, logger }),
  };
  app.locals.analytics = state.analytics;
  app.locals.seo = state.seo;
  app.locals.adminStore = state.adminStore;
""",
)
replace_once(
    'src/server/app.js',
    """  app.get('/admin/analytics', adminAuth, (req, res) => sendHtml(req, res, ANALYTICS_HTML, { pathname: '/admin/analytics', seo: false, track: false }, state));
""",
    """  app.get('/admin', (_req, res) => res.redirect(302, '/admin/analytics'));
  app.get('/admin/analytics', adminAuth, (req, res) => sendHtml(req, res, ANALYTICS_HTML, { pathname: '/admin/analytics', seo: false, track: false }, state));
""",
)

admin_routes_anchor = """  app.post('/api/admin/analytics/search', adminLimit, adminAuth, express.json({ limit: '2mb', strict: true }), async (req, res, next) => {
    try {
      const imported = await state.analytics.importSearch(req.body?.rows, req.body?.defaultDate);
      res.status(201).json({ ok: true, imported });
    } catch (error) {
      next(error);
    }
  });

"""
admin_routes = admin_routes_anchor + """  app.get('/api/admin/growth/overview', adminLimit, adminAuth, async (req, res, next) => {
    try {
      const current = await state.analytics.summary(req.query);
      if (!current.enabled) throw new HttpError(503, 'ANALYTICS_DISABLED', 'Analytics is disabled.');
      const previousQuery = previousRange(current);
      const [previous, auditHistory, goals, annotations] = await Promise.all([
        state.analytics.summary(previousQuery),
        state.adminStore.auditHistory(1),
        state.adminStore.getGoals(),
        state.adminStore.listAnnotations({ from: current.from, to: current.to }),
      ]);
      res.json(buildGrowthReport({
        current,
        previous,
        audit: auditHistory[0] || null,
        goals,
        annotations,
        configuration: {
          siteUrl: state.seo.siteUrl,
          googleVerification: state.seo.googleVerification,
          bingVerification: state.seo.bingVerification,
        },
      }));
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/admin/goals', adminLimit, adminAuth, async (_req, res, next) => {
    try {
      res.json(await state.adminStore.getGoals());
    } catch (error) {
      next(error);
    }
  });
  app.put('/api/admin/goals', adminLimit, adminAuth, requireSameOrigin, express.json({ limit: '32kb', strict: true }), async (req, res, next) => {
    try {
      res.json(await state.adminStore.saveGoals(req.body));
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/admin/annotations', adminLimit, adminAuth, async (req, res, next) => {
    try {
      res.json({ entries: await state.adminStore.listAnnotations(req.query) });
    } catch (error) {
      next(error);
    }
  });
  app.post('/api/admin/annotations', adminLimit, adminAuth, requireSameOrigin, express.json({ limit: '32kb', strict: true }), async (req, res, next) => {
    try {
      res.status(201).json(await state.adminStore.addAnnotation(req.body));
    } catch (error) {
      next(error);
    }
  });
  app.delete('/api/admin/annotations/:id', adminLimit, adminAuth, requireSameOrigin, async (req, res, next) => {
    try {
      await state.adminStore.deleteAnnotation(req.params.id);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/admin/seo/audits', adminLimit, adminAuth, async (req, res, next) => {
    try {
      res.json({ entries: await state.adminStore.auditHistory(req.query.limit) });
    } catch (error) {
      next(error);
    }
  });
  app.post('/api/admin/seo/audit/run', adminLimit, adminAuth, requireSameOrigin, express.json({ limit: '8kb', strict: true }), async (req, res, next) => {
    try {
      const report = await runSeoAudit({
        origin: internalServerUrl(req),
        siteUrl: state.seo.siteUrl,
        timeoutMs: positiveInteger(environment.SEO_AUDIT_TIMEOUT_MS, 8_000, 1_000, 30_000),
      });
      await state.adminStore.saveAudit(report);
      res.status(201).json(report);
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/admin/integrations/status', adminLimit, adminAuth, async (_req, res, next) => {
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

  app.post('/api/admin/seo/search-console/sync', adminLimit, adminAuth, requireSameOrigin, express.json({ limit: '16kb', strict: true }), async (req, res, next) => {
    try {
      const result = await syncSearchConsole({
        environment,
        from: req.body?.from,
        to: req.body?.to,
        importRows: state.analytics.importSearch.bind(state.analytics),
      });
      const { rows: _rows, ...publicResult } = result;
      await state.adminStore.saveIntegrationStatus('searchConsole', { ok: true, ...publicResult });
      res.status(201).json(publicResult);
    } catch (error) {
      await state.adminStore.saveIntegrationStatus('searchConsole', { ok: false, error: error.message }).catch(() => {});
      next(error);
    }
  });

  app.post('/api/admin/seo/indexnow', adminLimit, adminAuth, requireSameOrigin, express.json({ limit: '8kb', strict: true }), async (_req, res, next) => {
    try {
      const sitemap = sitemapXml(state.seo);
      const urls = [...sitemap.matchAll(/<loc>([^<]+)<\\/loc>/g)].map((match) => match[1]);
      const result = await submitIndexNow({ environment, urls });
      await state.adminStore.saveIntegrationStatus('indexNow', { ok: true, ...result });
      res.status(201).json(result);
    } catch (error) {
      await state.adminStore.saveIntegrationStatus('indexNow', { ok: false, error: error.message }).catch(() => {});
      next(error);
    }
  });

  const indexNowPublic = indexNowConfig(environment);
  if (indexNowPublic.enabled) {
    app.get(`/${indexNowPublic.key}.txt`, (_req, res) => {
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.type('text/plain').send(indexNowPublic.key);
    });
  }

"""
replace_once('src/server/app.js', admin_routes_anchor, admin_routes)

# --- Package and environment ---
package_path = ROOT / 'package.json'
package = json.loads(package_path.read_text(encoding='utf-8'))
package['version'] = '1.5.0'
package['description'] = 'A free Persian-first Mermaid studio with an advanced first-party growth, revenue and technical SEO control center.'
checks = [
    'src/server/admin-store.js',
    'src/server/growth-insights.js',
    'src/server/seo-audit.js',
    'src/server/search-console.js',
    'src/server/indexnow.js',
]
check_script = package['scripts']['check']
for file in checks:
    token = f'node --check {file}'
    if token not in check_script:
        check_script += f' && {token}'
package['scripts']['check'] = check_script
product_test = package['scripts']['test:product']
if 'tests/admin-control-center.test.mjs' not in product_test:
    product_test = product_test.replace('tests/seo.test.mjs', 'tests/seo.test.mjs tests/admin-control-center.test.mjs')
package['scripts']['test:product'] = product_test
package['scripts']['test:admin'] = 'node --test tests/admin-control-center.test.mjs'
keywords = package.setdefault('keywords', [])
for keyword in ['admin-dashboard', 'search-console', 'indexnow', 'technical-seo', 'revenue-analytics']:
    if keyword not in keywords:
        keywords.append(keyword)
package_path.write_text(json.dumps(package, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

lock_path = ROOT / 'package-lock.json'
lock = json.loads(lock_path.read_text(encoding='utf-8'))
lock['version'] = '1.5.0'
if '' in lock.get('packages', {}):
    lock['packages']['']['version'] = '1.5.0'
lock_path.write_text(json.dumps(lock, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

env_path = ROOT / '.env.example'
env_text = env_path.read_text(encoding='utf-8')
seo_block = """

# Admin growth control center and live SEO audit.
SEO_AUDIT_TIMEOUT_MS=8000

# Optional direct Google Search Console sync via a service account.
# Add the service-account email as a user of the exact Search Console property.
GSC_ENABLED=false
GSC_SITE_URL=
GSC_SERVICE_ACCOUNT_FILE=
# Alternative to a mounted file: base64-encoded service-account JSON.
GSC_SERVICE_ACCOUNT_B64=
GSC_ROW_LIMIT=25000
GSC_MAX_ROWS=100000
GSC_SEARCH_TYPE=web

# Optional IndexNow submission. The key is served at /<key>.txt when enabled.
INDEXNOW_ENABLED=false
INDEXNOW_KEY=
INDEXNOW_ENDPOINT=https://api.indexnow.org/indexnow
"""
if 'SEO_AUDIT_TIMEOUT_MS=' not in env_text:
    env_text = env_text.rstrip() + seo_block + '\n'
env_path.write_text(env_text, encoding='utf-8')

print('Admin growth backend finalization applied.')
