import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { EXAMPLES } from '../shared/examples.js';
import {
  THEMES,
  FORMATS,
  PDF_PAPERS,
  LAYOUTS,
  BACKGROUNDS,
  DEFAULTS,
  mimeFor,
} from '../shared/config.js';
import { renderDiagram } from '../core/renderer.js';
import {
  HttpError,
  createRateLimiter,
  createRenderGate,
  normalizeRenderRequest,
  positiveInteger,
} from './guards.js';
import { advertisingConfig, advertisingCspSources, prepareAdvertisingHtml } from './ads.js';
import { AnalyticsError, createAnalyticsService } from './analytics.js';
import { createAdminStore } from './admin-store.js';
import { buildGrowthReport, previousRange } from './growth-insights.js';
import { runSeoAudit } from './seo-audit.js';
import { searchConsoleConfig, syncSearchConsole } from './search-console.js';
import { indexNowConfig, submitIndexNow } from './indexnow.js';
import { getLearnArticle, renderLearnArticle } from './learn-content.js';
import { getEditorialArticle, renderArticlesIndex, renderEditorialArticle } from './article-content.js';
import { contentInventory } from './content-registry.js';
import { buildContentOperations } from './content-operations.js';
import { applySiteShell } from './site-shell.js';
import {
  canonicalRedirect,
  enhanceHtml,
  llmsTxt,
  ogImageSvg,
  pageSeo,
  robotsTxt,
  seoConfig,
  sitemapXml,
} from './seo.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const NODE_MODULES = path.join(ROOT, 'node_modules');
const require = createRequire(import.meta.url);
const pkg = require('../../package.json');

const BUILD = `${pkg.version}.${Date.now().toString(36)}`;
const LANDING_HTML = path.join(PUBLIC_DIR, 'landing.html');
const EDITOR_HTML = path.join(PUBLIC_DIR, 'index.html');
const TEMPLATES_HTML = path.join(PUBLIC_DIR, 'templates.html');
const LEARN_HTML = path.join(PUBLIC_DIR, 'learn.html');
const ANALYTICS_HTML = path.join(PUBLIC_DIR, 'analytics.html');
const CONTENT_ADMIN_HTML = path.join(PUBLIC_DIR, 'content-admin.html');
const ABOUT_HTML = path.join(PUBLIC_DIR, 'about.html');
const EDITORIAL_POLICY_HTML = path.join(PUBLIC_DIR, 'editorial-policy.html');
const HEADLESS_HTML = path.join(PUBLIC_DIR, 'headless.html');
const PRIVACY_HTML = path.join(PUBLIC_DIR, 'privacy.html');
const TERMS_HTML = path.join(PUBLIC_DIR, 'terms.html');

const ICON_PACKS = ['logos', 'mdi', 'fa6-solid', 'fa6-brands'];
const DIAGRAM_TYPES = [
  'flowchart', 'sequence', 'class', 'state', 'entity-relationship', 'user journey',
  'gantt', 'pie', 'quadrant', 'requirement', 'gitgraph', 'C4', 'mindmap', 'timeline',
  'sankey', 'xychart', 'block', 'packet', 'kanban', 'architecture', 'radar', 'zenuml',
];

const FORMAT_SET = new Set(FORMATS);
const THEME_SET = new Set(THEMES);
const LAYOUT_SET = new Set(LAYOUTS);
const PAPER_SET = new Set(PDF_PAPERS);
const BACKGROUND_SET = new Set(Object.keys(BACKGROUNDS));
const ADVERTISING_PATHS = new Set(['/', '/templates', '/learn', '/articles']);
const TRACKED_PATHS = new Set(['/', '/editor', '/templates', '/learn', '/articles', '/about', '/editorial-policy', '/privacy', '/terms']);

function envBoolean(environment, name, fallback = false) {
  const value = environment[name];
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function javascriptType(res, filePath) {
  if (filePath.endsWith('.mjs') || filePath.endsWith('.js')) {
    res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
  }
}

function vendorHeaders(res, filePath) {
  javascriptType(res, filePath);
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

function appAssetHeaders(res, filePath) {
  javascriptType(res, filePath);
  const extension = path.extname(filePath).toLowerCase();
  const immutable = new Set(['.js', '.css', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.woff', '.woff2']);
  res.setHeader('Cache-Control', immutable.has(extension)
    ? 'public, max-age=31536000, immutable'
    : 'public, max-age=3600');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

function inlineScriptHashes(html) {
  const hashes = [];
  const pattern = /<script\b(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = pattern.exec(html))) {
    // HTML parsing normalizes CRLF/CR line endings before CSP hash checks.
    const body = match[1].replace(/\r\n?/g, '\n');
    if (!body.trim()) continue;
    hashes.push(`'sha256-${crypto.createHash('sha256').update(body).digest('base64')}'`);
  }
  return hashes;
}

function advertisingAllowed(pathname) {
  return ADVERTISING_PATHS.has(pathname) || pathname.startsWith('/learn/') || pathname.startsWith('/articles/');
}

function contentSecurityPolicy(req, environment, inlineHashes = []) {
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

function securityHeaders(environment) {
  return function applySecurityHeaders(req, res, next) {
    res.setHeader('Content-Security-Policy', contentSecurityPolicy(req, environment));
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'accelerometer=(), camera=(), geolocation=(), gyroscope=(), microphone=(), payment=(), usb=()');
    if (req.path.startsWith('/admin/') || req.path === '/headless' || req.path === '/editor') {
      res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    }
    if (req.secure || envBoolean(environment, 'FORCE_HSTS')) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  };
}

function analyticsTracked(pathname) {
  return TRACKED_PATHS.has(pathname) || pathname.startsWith('/learn/') || pathname.startsWith('/articles/');
}

function injectAnalyticsScript(html, pathname, analytics) {
  if (!analytics.publicConfig().enabled || !analyticsTracked(pathname) || html.includes('/js/analytics.js')) return html;
  return html.replace('</body>', `  <script type="module" src="/js/analytics.js?v=${BUILD}"></script>\n</body>`);
}

function prepareHtml(req, source, { pathname = req.path, seo = true, track = true } = {}, state) {
  let html = applySiteShell(source, pathname).split('%V%').join(BUILD);
  let meta = null;
  if (seo) {
    const enhanced = enhanceHtml(html, pathname, state.seo);
    html = enhanced.html;
    meta = enhanced.meta;
  }
  if (advertisingAllowed(pathname)) html = prepareAdvertisingHtml(html, state.environment);
  if (track) html = injectAnalyticsScript(html, pathname, state.analytics);
  const hashes = inlineScriptHashes(html);
  return { html, meta, hashes };
}

function sendHtml(req, res, filePath, options, state) {
  const source = fs.readFileSync(filePath, 'utf8');
  return sendHtmlSource(req, res, source, options, state);
}

function sendHtmlSource(req, res, source, options, state) {
  const prepared = prepareHtml(req, source, options, state);
  res.setHeader('Content-Security-Policy', contentSecurityPolicy(req, state.environment, prepared.hashes));
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Language', 'fa-IR');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (prepared.meta?.canonical) res.setHeader('Link', `<${prepared.meta.canonical}>; rel="canonical"`);
  if (prepared.meta?.robots?.startsWith('noindex')) res.setHeader('X-Robots-Tag', prepared.meta.robots);
  res.send(prepared.html);
}

function internalServerUrl(req) {
  return `http://127.0.0.1:${req.socket.localPort}`;
}

function sendRenderResult(res, result, format, download) {
  const bytes = Buffer.isBuffer(result.buffer) ? result.buffer : Buffer.from(result.buffer);
  const normalizedFormat = format === 'jpeg' ? 'jpg' : format;
  res.setHeader('Content-Type', result.mime || mimeFor(format));
  res.setHeader('Content-Length', String(bytes.length));
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (format === 'svg') {
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src data:");
  }
  if (download) res.setHeader('Content-Disposition', `attachment; filename="diagram.${normalizedFormat}"`);
  res.end(bytes);
}

function decodeQueryCode(query) {
  const raw = query.code || '';
  if (query.encoding !== 'base64') return String(raw);
  const encoded = String(raw).replace(/\s+/g, '');
  if (!encoded || encoded.length % 4 === 1 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
    throw new HttpError(400, 'INVALID_ENCODING', 'The base64 diagram code is invalid.');
  }
  return Buffer.from(encoded, 'base64').toString('utf8');
}

function publicError(error) {
  if (error instanceof HttpError || error instanceof AnalyticsError) return error;
  if (Number.isInteger(error?.status) && error?.code) {
    return new HttpError(error.status, error.code, error.message || 'The request could not be completed.');
  }
  if (error?.type === 'entity.too.large') return new HttpError(413, 'REQUEST_TOO_LARGE', 'The request body is too large.');
  if (error instanceof SyntaxError && Object.prototype.hasOwnProperty.call(error, 'body')) {
    return new HttpError(400, 'INVALID_JSON', 'The request body must be valid JSON.');
  }
  if (error?.name === 'MermaidParseError') return new HttpError(422, 'MERMAID_PARSE_ERROR', error.message || 'The Mermaid diagram is invalid.');
  if (error?.name === 'ChromeUnavailableError') return new HttpError(503, 'RENDERER_UNAVAILABLE', 'The server-side renderer is unavailable.');
  if (error?.name === 'RenderTimeoutError') return new HttpError(504, 'RENDER_TIMEOUT', 'The render operation exceeded its time limit.');
  if (error?.name === 'RenderSizeError') return new HttpError(413, 'OUTPUT_TOO_LARGE', error.message || 'The rendered diagram is too large.');
  return new HttpError(500, 'INTERNAL_ERROR', 'The request could not be completed.');
}

function requireSameOrigin(req, _res, next) {
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
  if (!analytics.config.respectDnt) return false;
  return req.get('DNT') === '1' || req.get('Sec-GPC') === '1';
}

function notFoundHtml(state) {
  const meta = pageSeo('/404', state.seo);
  return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${meta.title}</title><meta name="description" content="${meta.description}"><meta name="robots" content="noindex,follow"><link rel="stylesheet" href="/css/landing.css?v=%V%"></head><body><main class="legal-page"><a class="legal-back" href="/">→ بازگشت به صفحه اصلی</a><h1>صفحه پیدا نشد</h1><p>آدرس واردشده وجود ندارد یا جابه‌جا شده است.</p><p><a class="button button-primary" href="/learn">مشاهده آموزش‌ها</a> <a class="button button-secondary" href="/editor">ورود به ادیتور</a></p></main></body></html>`;
}

export function createApp({ environment = process.env, logger = console } = {}) {
  const app = express();
  app.disable('x-powered-by');

  const analytics = createAnalyticsService({ env: environment, logger });
  const state = {
    environment,
    seo: seoConfig(environment),
    analytics,
    adminStore: createAdminStore({ dataDir: analytics.config.dataDir, logger }),
  };
  app.locals.analytics = state.analytics;
  app.locals.seo = state.seo;
  app.locals.adminStore = state.adminStore;

  if (envBoolean(environment, 'TRUST_PROXY')) app.set('trust proxy', 1);
  app.use(securityHeaders(environment));

  app.use((req, res, next) => {
    if (!['GET', 'HEAD'].includes(req.method)) return next();
    const target = canonicalRedirect(req.path);
    if (!target) return next();
    const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    res.redirect(301, `${target}${query}`);
  });

  const analyticsEventLimit = createRateLimiter({
    windowMs: positiveInteger(environment.ANALYTICS_RATE_WINDOW_MS, 60_000, 1_000, 3_600_000),
    max: positiveInteger(environment.ANALYTICS_RATE_MAX, 240, 10, 20_000),
  });
  const adminLimit = createRateLimiter({ windowMs: 60_000, max: 180 });
  const adminAuth = state.analytics.adminAuth.bind(state.analytics);

  app.get('/api/analytics/config', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(state.analytics.publicConfig());
  });
  app.post('/api/analytics/event', analyticsEventLimit, express.json({ limit: '8kb', strict: true }), async (req, res, next) => {
    try {
      if (!state.analytics.publicConfig().enabled || noTrackRequest(req, state.analytics)) return res.status(204).end();
      await state.analytics.record(req.body, req);
      return res.status(204).end();
    } catch (error) {
      return next(error);
    }
  });

  app.get('/admin', (_req, res) => res.redirect(302, '/admin/analytics'));
  app.get('/admin/analytics', adminAuth, (req, res) => sendHtml(req, res, ANALYTICS_HTML, { pathname: '/admin/analytics', seo: false, track: false }, state));
  app.get('/admin/content', adminAuth, (req, res) => sendHtml(req, res, CONTENT_ADMIN_HTML, { pathname: '/admin/content', seo: false, track: false }, state));
  app.get('/analytics.html', (_req, res) => res.redirect(302, '/admin/analytics'));
  app.get('/api/admin/analytics/summary', adminLimit, adminAuth, async (req, res, next) => {
    try {
      res.json(await state.analytics.summary(req.query));
    } catch (error) {
      next(error);
    }
  });
  app.get('/api/admin/analytics/export.csv', adminLimit, adminAuth, async (req, res, next) => {
    try {
      const csv = await state.analytics.csv(req.query);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="mermaid-studio-analytics-${Date.now()}.csv"`);
      res.send(`\ufeff${csv}`);
    } catch (error) {
      next(error);
    }
  });
  app.post('/api/admin/analytics/revenue', adminLimit, adminAuth, express.json({ limit: '256kb', strict: true }), async (req, res, next) => {
    try {
      const entries = await state.analytics.addRevenue(req.body?.entries ?? req.body);
      res.status(201).json({ ok: true, entries });
    } catch (error) {
      next(error);
    }
  });
  app.delete('/api/admin/analytics/revenue/:id', adminLimit, adminAuth, async (req, res, next) => {
    try {
      await state.analytics.deleteRevenue(req.params.id);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });
  app.post('/api/admin/analytics/search', adminLimit, adminAuth, express.json({ limit: '2mb', strict: true }), async (req, res, next) => {
    try {
      const imported = await state.analytics.importSearch(req.body?.rows, req.body?.defaultDate);
      res.status(201).json({ ok: true, imported });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/admin/growth/overview', adminLimit, adminAuth, async (req, res, next) => {
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

  app.get('/api/admin/content/overview', adminLimit, adminAuth, async (req, res, next) => {
    try {
      const current = await state.analytics.summary(req.query);
      if (!current.enabled) throw new HttpError(503, 'ANALYTICS_DISABLED', 'Analytics is disabled.');
      const previous = await state.analytics.summary(previousRange(current));
      const growth = buildGrowthReport({
        current,
        previous,
        audit: (await state.adminStore.auditHistory(1))[0] || null,
        goals: await state.adminStore.getGoals(),
        annotations: await state.adminStore.listAnnotations({ from: current.from, to: current.to }),
        configuration: { siteUrl: state.seo.siteUrl, googleVerification: state.seo.googleVerification, bingVerification: state.seo.bingVerification },
      });
      const briefs = await state.adminStore.listContentBriefs();
      res.json(buildContentOperations({ inventory: contentInventory(), growth, briefs }));
    } catch (error) {
      next(error);
    }
  });
  app.get('/api/admin/content/briefs', adminLimit, adminAuth, async (_req, res, next) => {
    try { res.json({ entries: await state.adminStore.listContentBriefs() }); } catch (error) { next(error); }
  });
  app.post('/api/admin/content/briefs', adminLimit, adminAuth, requireSameOrigin, express.json({ limit: '64kb', strict: true }), async (req, res, next) => {
    try { res.status(201).json(await state.adminStore.saveContentBrief(req.body)); } catch (error) { next(error); }
  });
  app.put('/api/admin/content/briefs/:id', adminLimit, adminAuth, requireSameOrigin, express.json({ limit: '64kb', strict: true }), async (req, res, next) => {
    try { res.json(await state.adminStore.saveContentBrief(req.body, req.params.id)); } catch (error) { next(error); }
  });
  app.delete('/api/admin/content/briefs/:id', adminLimit, adminAuth, requireSameOrigin, async (req, res, next) => {
    try { await state.adminStore.deleteContentBrief(req.params.id); res.status(204).end(); } catch (error) { next(error); }
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
      const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
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

  app.use(express.json({ limit: environment.JSON_BODY_LIMIT || '256kb', strict: true }));

  const renderRateLimit = createRateLimiter({
    windowMs: positiveInteger(environment.RENDER_RATE_WINDOW_MS, 60_000, 1_000, 3_600_000),
    max: positiveInteger(environment.RENDER_RATE_MAX, 30, 1, 10_000),
  });
  const renderGate = createRenderGate({
    concurrency: positiveInteger(environment.RENDER_CONCURRENCY, 2, 1, 16),
    maxQueue: positiveInteger(environment.RENDER_QUEUE_MAX, 20, 0, 1_000),
  });

  app.use('/vendor/mermaid', express.static(path.join(NODE_MODULES, 'mermaid', 'dist'), { setHeaders: vendorHeaders }));
  app.use('/vendor/codemirror', express.static(path.join(NODE_MODULES, 'codemirror'), { setHeaders: vendorHeaders }));
  app.use('/vendor/katex', express.static(path.join(NODE_MODULES, 'katex', 'dist'), { setHeaders: vendorHeaders }));
  app.use('/vendor/pako', express.static(path.join(NODE_MODULES, 'pako', 'dist'), { setHeaders: vendorHeaders }));
  app.use('/vendor/iconify', express.static(path.join(NODE_MODULES, '@iconify-json'), { setHeaders: vendorHeaders }));
  app.use('/vendor/fontsource/vazirmatn', express.static(path.join(NODE_MODULES, '@fontsource-variable', 'vazirmatn'), { setHeaders: vendorHeaders }));
  app.use('/vendor/fontsource/jetbrains-mono', express.static(path.join(NODE_MODULES, '@fontsource-variable', 'jetbrains-mono'), { setHeaders: vendorHeaders }));
  app.use('/vendor-build', express.static(path.join(PUBLIC_DIR, 'vendor-build'), { setHeaders: vendorHeaders }));

  app.get('/', (req, res) => sendHtml(req, res, LANDING_HTML, { pathname: '/' }, state));
  app.get('/editor', (req, res) => sendHtml(req, res, EDITOR_HTML, { pathname: '/editor' }, state));
  app.get('/templates', (req, res) => sendHtml(req, res, TEMPLATES_HTML, { pathname: '/templates' }, state));
  app.get('/learn', (req, res) => sendHtml(req, res, LEARN_HTML, { pathname: '/learn' }, state));
  app.get('/learn/:slug', (req, res, next) => {
    if (!getLearnArticle(req.params.slug)) return next();
    return sendHtmlSource(req, res, renderLearnArticle(req.params.slug), { pathname: `/learn/${req.params.slug}` }, state);
  });
  app.get('/articles', (req, res) => sendHtmlSource(req, res, renderArticlesIndex(), { pathname: '/articles' }, state));
  app.get('/articles/:slug', (req, res, next) => {
    if (!getEditorialArticle(req.params.slug)) return next();
    return sendHtmlSource(req, res, renderEditorialArticle(req.params.slug), { pathname: `/articles/${req.params.slug}` }, state);
  });
  app.get('/about', (req, res) => sendHtml(req, res, ABOUT_HTML, { pathname: '/about' }, state));
  app.get('/editorial-policy', (req, res) => sendHtml(req, res, EDITORIAL_POLICY_HTML, { pathname: '/editorial-policy' }, state));
  app.get('/headless', (req, res) => sendHtml(req, res, HEADLESS_HTML, { pathname: '/headless', seo: false, track: false }, state));
  app.get('/privacy', (req, res) => sendHtml(req, res, PRIVACY_HTML, { pathname: '/privacy' }, state));
  app.get('/terms', (req, res) => sendHtml(req, res, TERMS_HTML, { pathname: '/terms' }, state));

  app.get('/sitemap.xml', (_req, res) => {
    const xml = sitemapXml(state.seo);
    if (!xml) return res.status(404).type('text/plain').send('SITE_URL is not configured.');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.type('application/xml').send(xml);
  });
  app.get('/robots.txt', (_req, res) => res.type('text/plain').send(robotsTxt(state.seo)));
  app.get('/llms.txt', (_req, res) => res.type('text/plain').send(llmsTxt(state.seo)));
  app.get('/og-image.svg', (_req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.type('image/svg+xml').send(ogImageSvg(state.seo));
  });
  app.get('/.well-known/security.txt', (_req, res) => {
    res.type('text/plain').send(`Contact: ${state.seo.githubUrl}/security/advisories/new\nCanonical: ${state.seo.siteUrl || ''}/.well-known/security.txt\nPreferred-Languages: fa, en\nExpires: 2027-07-13T00:00:00.000Z\n`);
  });

  for (const legacy of ['/landing.html', '/templates.html', '/learn.html', '/editor.html', '/about.html', '/editorial-policy.html', '/privacy.html', '/terms.html']) {
    app.get(legacy, (_req, res) => res.redirect(301, legacy === '/landing.html' ? '/' : legacy.replace('.html', '')));
  }

  app.use(express.static(PUBLIC_DIR, { setHeaders: appAssetHeaders, index: false, redirect: false }));

  const metadata = () => ({
    version: pkg.version,
    businessModel: 'advertising',
    product: { defaultLanguage: 'fa', languages: ['fa'], safeMode: true, localPreview: true, magazine: true, contentOperations: true },
    examples: EXAMPLES,
    themes: THEMES,
    formats: FORMATS,
    papers: PDF_PAPERS,
    layouts: LAYOUTS,
    backgrounds: Object.keys(BACKGROUNDS),
    iconPacks: ICON_PACKS,
    diagramTypes: DIAGRAM_TYPES,
    defaults: DEFAULTS,
  });

  app.get('/api/health', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ ok: true, version: pkg.version, render: renderGate.stats(), analytics: state.analytics.health() });
  });
  app.get('/api/version', (_req, res) => res.json({ name: pkg.name, version: pkg.version }));
  app.get('/api/meta', (_req, res) => res.json(metadata()));
  app.get('/api/examples', (_req, res) => res.json(metadata()));
  app.get('/api/ads', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(advertisingConfig(environment));
  });

  const normalize = (source) => normalizeRenderRequest(source, {
    formats: FORMAT_SET,
    themes: THEME_SET,
    layouts: LAYOUT_SET,
    papers: PAPER_SET,
    backgrounds: BACKGROUND_SET,
  });

  app.post('/api/render', renderRateLimit, async (req, res, next) => {
    try {
      const options = normalize(req.body);
      const result = await renderGate.run(() => renderDiagram({ serverUrl: internalServerUrl(req), ...options }));
      sendRenderResult(res, result, options.format, options.download);
    } catch (error) {
      next(error);
    }
  });
  app.get('/api/render', renderRateLimit, async (req, res, next) => {
    try {
      const options = normalize({ ...req.query, code: decodeQueryCode(req.query) });
      const result = await renderGate.run(() => renderDiagram({ serverUrl: internalServerUrl(req), ...options }));
      sendRenderResult(res, result, options.format, options.download);
    } catch (error) {
      next(error);
    }
  });

  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'API_NOT_FOUND', 'API route not found.')));
  app.use((req, res, next) => {
    if (!['GET', 'HEAD'].includes(req.method) || !req.accepts('html')) return next();
    res.status(404);
    return sendHtmlSource(req, res, notFoundHtml(state), { pathname: '/404' }, state);
  });
  app.use((error, _req, res, _next) => {
    const safe = publicError(error);
    if (safe.status >= 500) logger.error(`[${safe.code}]`, error?.message || error);
    if (res.headersSent) return;
    res.status(safe.status).json({ error: safe.message, code: safe.code });
  });

  return app;
}

export function startServer({ port = 0, host = '127.0.0.1', environment = process.env, logger = console } = {}) {
  const app = createApp({ environment, logger });
  return new Promise((resolve, reject) => {
    const server = app.listen(port, host, () => {
      const address = server.address();
      const actualPort = typeof address === 'object' && address ? address.port : port;
      const displayHost = host === '0.0.0.0' ? 'localhost' : host;
      resolve({
        server,
        app,
        port: actualPort,
        url: `http://${displayHost}:${actualPort}`,
        close: () => new Promise((done) => server.close(async () => {
          await app.locals.analytics?.close?.();
          done();
        })),
      });
    });
    server.on('error', reject);
  });
}
