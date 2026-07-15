#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path.cwd()


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


def write(path: str, content: str) -> None:
    file = ROOT / path
    file.parent.mkdir(parents=True, exist_ok=True)
    file.write_text(content, encoding='utf-8')


def replace_once(path: str, old: str, new: str) -> None:
    text = read(path)
    if old not in text:
        raise SystemExit(f'Expected block not found in {path}: {old[:180]!r}')
    write(path, text.replace(old, new, 1))


def insert_before(path: str, marker: str, content: str) -> None:
    text = read(path)
    if content.strip() in text:
        return
    if marker not in text:
        raise SystemExit(f'Marker not found in {path}: {marker!r}')
    write(path, text.replace(marker, content + marker, 1))


# ---------------------------------------------------------------------------
# Persistent editorial briefs
replace_once(
    'src/server/admin-store.js',
    "const ANNOTATION_TYPES = new Set(['release', 'campaign', 'content', 'technical', 'advertising', 'other']);\n",
    """const ANNOTATION_TYPES = new Set(['release', 'campaign', 'content', 'technical', 'advertising', 'other']);
const BRIEF_STATUSES = new Set(['idea', 'research', 'writing', 'review', 'scheduled', 'published', 'archived']);
const BRIEF_TYPES = new Set(['tutorial', 'article', 'landing', 'update']);
const SEARCH_INTENTS = new Set(['informational', 'problem-solving', 'comparison', 'navigational', 'transactional']);
""",
)

insert_before(
    'src/server/admin-store.js',
    'export class AdminStore {',
    """function normalizeContentBrief(input = {}, existing = {}) {
  const title = safeText(input.title, 180);
  if (!title) {
    const error = new Error('Content brief title is required.');
    error.status = 400;
    error.code = 'INVALID_CONTENT_BRIEF';
    throw error;
  }
  const status = safeText(input.status, 30).toLowerCase();
  const contentType = safeText(input.contentType, 30).toLowerCase();
  const searchIntent = safeText(input.searchIntent, 40).toLowerCase();
  const dueDate = input.dueDate ? safeDate(input.dueDate) : '';
  if (input.dueDate && !dueDate) {
    const error = new Error('Content brief dueDate must use YYYY-MM-DD.');
    error.status = 400;
    error.code = 'INVALID_CONTENT_BRIEF_DATE';
    throw error;
  }
  const now = new Date().toISOString();
  return {
    id: safeText(existing.id || input.id, 80) || crypto.randomUUID(),
    title,
    contentType: BRIEF_TYPES.has(contentType) ? contentType : 'article',
    status: BRIEF_STATUSES.has(status) ? status : 'idea',
    priority: Math.round(safeNumber(input.priority, 1, 5, 3)),
    owner: safeText(input.owner, 100),
    dueDate,
    cluster: safeText(input.cluster, 120),
    targetQuery: safeText(input.targetQuery, 220),
    searchIntent: SEARCH_INTENTS.has(searchIntent) ? searchIntent : 'informational',
    targetUrl: safeText(input.targetUrl, 300),
    angle: safeText(input.angle, 1_200),
    outline: safeText(input.outline, 4_000),
    successMetric: safeText(input.successMetric, 1_000),
    notes: safeText(input.notes, 2_000),
    createdAt: safeText(existing.createdAt || input.createdAt, 60) || now,
    updatedAt: now,
  };
}

""",
)

insert_before(
    'src/server/admin-store.js',
    '  async auditHistory(limit = 30) {',
    """  async listContentBriefs() {
    const collection = await readJson(this.file('content-briefs.json'), { version: 1, entries: [] });
    return (collection.entries || []).slice().sort((a, b) => a.priority - b.priority || (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || b.updatedAt.localeCompare(a.updatedAt));
  }

  saveContentBrief(input, id = '') {
    return this.enqueue(async () => {
      const collection = await readJson(this.file('content-briefs.json'), { version: 1, entries: [] });
      const existing = id ? (collection.entries || []).find((entry) => entry.id === safeText(id, 80)) : null;
      if (id && !existing) {
        const error = new Error('Content brief not found.');
        error.status = 404;
        error.code = 'CONTENT_BRIEF_NOT_FOUND';
        throw error;
      }
      const brief = normalizeContentBrief({ ...input, id: existing?.id || input.id }, existing || {});
      collection.entries = [...(collection.entries || []).filter((entry) => entry.id !== brief.id), brief].slice(-5_000);
      await atomicWrite(this.file('content-briefs.json'), collection);
      return brief;
    });
  }

  deleteContentBrief(id) {
    return this.enqueue(async () => {
      const safeId = safeText(id, 80);
      const collection = await readJson(this.file('content-briefs.json'), { version: 1, entries: [] });
      const before = (collection.entries || []).length;
      collection.entries = (collection.entries || []).filter((entry) => entry.id !== safeId);
      if (collection.entries.length === before) {
        const error = new Error('Content brief not found.');
        error.status = 404;
        error.code = 'CONTENT_BRIEF_NOT_FOUND';
        throw error;
      }
      await atomicWrite(this.file('content-briefs.json'), collection);
    });
  }

""",
)

# ---------------------------------------------------------------------------
# Ads: complete inventory + server-side space reservation to prevent CLS
write('src/server/ads.js', r'''/** Configuration helpers for Iranian publisher ad networks. */

const PROVIDERS = new Set(['yektanet', 'tapsell']);

const SLOT_ENV = Object.freeze({
  homeTop: 'ADS_SLOT_HOME_TOP',
  homeInline: 'ADS_SLOT_HOME_INLINE',
  templatesTop: 'ADS_SLOT_TEMPLATES_TOP',
  templatesInline: 'ADS_SLOT_TEMPLATES_INLINE',
  learnTop: 'ADS_SLOT_LEARN_TOP',
  learnInline: 'ADS_SLOT_LEARN_INLINE',
  learnFeed: 'ADS_SLOT_LEARN_FEED',
  articlesTop: 'ADS_SLOT_ARTICLES_TOP',
  articlesInline: 'ADS_SLOT_ARTICLES_INLINE',
  articleTop: 'ADS_SLOT_ARTICLE_TOP',
  articleMid: 'ADS_SLOT_ARTICLE_MID',
  articleEnd: 'ADS_SLOT_ARTICLE_END',
});

const SLOT_META = Object.freeze({
  homeTop: { format: 'leaderboard', desktop: 132, mobile: 112 },
  homeInline: { format: 'native', desktop: 178, mobile: 206 },
  templatesTop: { format: 'leaderboard', desktop: 122, mobile: 108 },
  templatesInline: { format: 'native', desktop: 178, mobile: 206 },
  learnTop: { format: 'leaderboard', desktop: 122, mobile: 108 },
  learnInline: { format: 'article', desktop: 154, mobile: 180 },
  learnFeed: { format: 'native', desktop: 184, mobile: 214 },
  articlesTop: { format: 'leaderboard', desktop: 122, mobile: 108 },
  articlesInline: { format: 'native', desktop: 184, mobile: 214 },
  articleTop: { format: 'article', desktop: 142, mobile: 174 },
  articleMid: { format: 'article', desktop: 154, mobile: 184 },
  articleEnd: { format: 'article', desktop: 154, mobile: 184 },
});

function booleanValue(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function integerValue(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function safeScriptUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password) return '';
    return url.href;
  } catch {
    return '';
  }
}

function safeDomId(value) {
  const id = String(value || '').trim();
  if (!id || id.length > 180 || !/^[A-Za-z][A-Za-z0-9_:.-]*$/.test(id)) return '';
  return id;
}

function safeCspSource(value) {
  const source = String(value || '').trim();
  if (!source) return '';
  if (/^https:\/\/\*\.[a-z0-9.-]+(?::\d{2,5})?$/i.test(source)) return source;
  try {
    const url = new URL(source);
    if (url.protocol !== 'https:' || url.username || url.password) return '';
    return url.origin;
  } catch {
    return '';
  }
}

export function advertisingConfig(environment = process.env) {
  const provider = String(environment.ADS_PROVIDER || '').trim().toLowerCase();
  const scriptUrl = safeScriptUrl(environment.ADS_SCRIPT_URL);
  const slots = Object.fromEntries(Object.entries(SLOT_ENV).map(([name, envName]) => [name, safeDomId(environment[envName])]));
  const hasPlacement = Object.values(slots).some(Boolean);
  const enabled = Boolean(booleanValue(environment.ADS_ENABLED) && PROVIDERS.has(provider) && scriptUrl && hasPlacement);
  return {
    enabled,
    provider: PROVIDERS.has(provider) ? provider : null,
    scriptUrl: enabled ? scriptUrl : null,
    scriptId: safeDomId(environment.ADS_SCRIPT_ID) || `nemodara-${provider || 'ads'}-script`,
    loadDelayMs: integerValue(environment.ADS_LOAD_DELAY_MS, 700, 0, 10_000),
    slots,
    slotMeta: SLOT_META,
    privacyUrl: '/privacy#advertising',
  };
}

export function advertisingCspSources(environment = process.env) {
  const config = advertisingConfig(environment);
  if (!config.enabled) return [];
  const values = [
    config.scriptUrl,
    ...String(environment.ADS_ALLOWED_ORIGINS || '').split(',').map((item) => item.trim()),
  ];
  return [...new Set(values.map(safeCspSource).filter(Boolean))];
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Unhides only configured placements while HTML is still on the server. This
 * reserves the final slot height before first paint and avoids ad-induced CLS.
 */
export function prepareAdvertisingHtml(input, environment = process.env) {
  const config = advertisingConfig(environment);
  if (!config.enabled) return String(input);
  let html = String(input);
  for (const [name, placement] of Object.entries(config.slots)) {
    if (!placement) continue;
    const meta = config.slotMeta[name] || { format: 'native', desktop: 160, mobile: 190 };
    const pattern = new RegExp(`(<(?:aside|div)\\b[^>]*\\bdata-ad-slot=["']${escapeRegex(name)}["'][^>]*)(>)`, 'i');
    html = html.replace(pattern, (_match, rawTag, close) => {
      let tag = rawTag.replace(/\s+hidden(?=\s|$)/i, '');
      if (!/\bdata-ad-state=/.test(tag)) tag += ' data-ad-state="reserved"';
      if (!/\bdata-ad-format=/.test(tag)) tag += ` data-ad-format="${meta.format}"`;
      const style = `--ad-min-desktop:${meta.desktop}px;--ad-min-mobile:${meta.mobile}px`;
      if (/\bstyle=["']/.test(tag)) tag = tag.replace(/\bstyle=(["'])([^"']*)\1/i, (_s, quote, value) => `style=${quote}${value};${style}${quote}`);
      else tag += ` style="${style}"`;
      return tag + close;
    });
  }
  return html;
}

export { PROVIDERS, SLOT_ENV, SLOT_META };
''')

write('public/js/ads.js', r'''const SLOT_SELECTOR = '[data-ad-slot]';
const ENDPOINT = '/api/ads';

function notify(type, slot = 'all') {
  window.dispatchEvent(new CustomEvent('mstudio:ad', { detail: { type, slot } }));
}

function prepareYektanetQueue() {
  window.yektanetAnalyticsObject = window.yektanetAnalyticsObject || 'yektanet';
  const objectName = window.yektanetAnalyticsObject;
  if (typeof window[objectName] !== 'function') {
    const queue = function (...args) { queue.q.push(args); };
    queue.q = [];
    window[objectName] = queue;
  } else if (!Array.isArray(window[objectName].q)) {
    window[objectName].q = [];
  }
}

function applySlotMeta(shell, meta = {}) {
  if (meta.format) shell.dataset.adFormat = meta.format;
  if (Number(meta.desktop)) shell.style.setProperty('--ad-min-desktop', `${meta.desktop}px`);
  if (Number(meta.mobile)) shell.style.setProperty('--ad-min-mobile', `${meta.mobile}px`);
}

function mountPlacement(shell, placementId, provider) {
  const mount = shell.querySelector('[data-ad-mount]') || shell;
  const placement = document.createElement('div');
  placement.id = placementId;
  placement.className = 'ad-network-placement';
  placement.dataset.provider = provider;
  mount.replaceChildren(placement);
  shell.hidden = false;
  shell.dataset.adState = 'mounted';
  notify('mounted', shell.dataset.adSlot || 'unknown');
  return shell;
}

function publisherScriptUrl(config) {
  const url = new URL(config.scriptUrl, window.location.href);
  if (config.provider === 'yektanet' && !url.searchParams.has('v')) {
    const now = new Date();
    url.searchParams.set('v', `${now.getFullYear()}0${now.getMonth()}0${now.getDate()}0${now.getHours()}`);
  }
  return url.href;
}

function loadScript(config) {
  const existing = document.getElementById(config.scriptId);
  if (existing) return Promise.resolve(existing);
  if (config.provider === 'yektanet') prepareYektanetQueue();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.id = config.scriptId;
    script.src = publisherScriptUrl(config);
    if (config.provider === 'yektanet') script.dataset.analyticsobject = window.yektanetAnalyticsObject;
    script.async = true;
    script.type = 'text/javascript';
    script.referrerPolicy = 'strict-origin-when-cross-origin';
    script.addEventListener('load', () => resolve(script), { once: true });
    script.addEventListener('error', () => reject(new Error('AD_SCRIPT_FAILED')), { once: true });
    document.head.appendChild(script);
  });
}

function afterPageSettles(delayMs) {
  return new Promise((resolve) => {
    const start = () => window.setTimeout(resolve, delayMs);
    if ('requestIdleCallback' in window) window.requestIdleCallback(start, { timeout: Math.max(1_200, delayMs + 500) });
    else if (document.readyState === 'complete') start();
    else window.addEventListener('load', start, { once: true });
  });
}

function hideUnconfigured(shells) {
  for (const shell of shells) {
    if (shell.dataset.adState !== 'reserved') shell.hidden = true;
  }
}

async function initializeAds() {
  const shells = [...document.querySelectorAll(SLOT_SELECTOR)];
  if (!shells.length) return;
  let config;
  try {
    const response = await fetch(ENDPOINT, { credentials: 'same-origin', headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (!response.ok) throw new Error(`ADS_CONFIG_${response.status}`);
    config = await response.json();
  } catch {
    hideUnconfigured(shells);
    notify('error', 'config');
    return;
  }
  if (!config?.enabled || !config.scriptUrl || !config.provider) {
    shells.forEach((shell) => { shell.hidden = true; shell.dataset.adState = 'disabled'; });
    return;
  }
  const active = [];
  for (const shell of shells) {
    const name = shell.dataset.adSlot;
    const placementId = config.slots?.[name];
    if (!placementId) {
      shell.hidden = true;
      continue;
    }
    applySlotMeta(shell, config.slotMeta?.[name]);
    active.push(mountPlacement(shell, placementId, config.provider));
  }
  if (!active.length) return;
  document.documentElement.dataset.adsProvider = config.provider;
  await afterPageSettles(Number(config.loadDelayMs) || 0);
  try {
    await loadScript(config);
    active.forEach((slot) => {
      slot.dataset.adState = 'loaded';
      notify('loaded', slot.dataset.adSlot || 'unknown');
    });
  } catch {
    active.forEach((slot) => {
      slot.dataset.adState = navigator.onLine ? 'blocked' : 'error';
      notify(navigator.onLine ? 'blocked' : 'error', slot.dataset.adSlot || 'unknown');
    });
  }
}

initializeAds();
''')

write('public/css/ads.css', r'''/* Reserved, labelled and non-overlay publisher placements. */
.ad-slot {
  --ad-min-desktop: 132px;
  --ad-min-mobile: 112px;
  position: relative;
  z-index: 1;
  width: min(calc(100% - 32px), 1160px);
  min-height: var(--ad-min-desktop);
  margin: 34px auto;
  padding: 26px 14px 12px;
  overflow: hidden;
  border: 1px solid var(--border, #d7d8d2);
  border-radius: 14px;
  background: color-mix(in srgb, var(--panel, #fff) 94%, transparent);
  contain: layout paint;
}
.ad-slot[hidden] { display: none !important; }
.ad-slot__label, .ad-slot__privacy { position: absolute; inset-block-start: 8px; color: var(--muted, #71766e); font-size: 9px; line-height: 1; }
.ad-slot__label { inset-inline-start: 12px; }
.ad-slot__privacy { inset-inline-end: 12px; text-decoration: none; }
.ad-slot__privacy:hover { color: var(--text, #1b221d); }
.ad-slot__mount, .ad-network-placement { width: 100%; min-height: calc(var(--ad-min-desktop) - 38px); }
.ad-slot__mount { display: grid; place-items: center; }
.ad-network-placement { grid-area: 1 / 1; max-width: 100%; }
.ad-slot[data-ad-state='reserved'] .ad-slot__mount::before,
.ad-slot[data-ad-state='mounted'] .ad-slot__mount::before {
  content: '';
  grid-area: 1 / 1;
  width: 100%;
  height: 100%;
  min-height: 68px;
  border-radius: 9px;
  background: linear-gradient(100deg, transparent 20%, color-mix(in srgb, var(--border, #ddd) 45%, transparent) 42%, transparent 64%);
  background-size: 240% 100%;
  animation: ad-shimmer 1.5s linear infinite;
}
.ad-slot[data-ad-state='loaded'] .ad-slot__mount::before { content: none; animation: none; }
.ad-slot[data-ad-state='blocked'] .ad-slot__mount::before,
.ad-slot[data-ad-state='error'] .ad-slot__mount::before { content: 'تبلیغ در این مرورگر بارگذاری نشد'; width: auto; height: auto; min-height: 0; background: none; animation: none; color: var(--muted, #71766e); font-size: 10px; }
.ad-slot[data-ad-format='leaderboard'] { max-width: 970px; }
.ad-slot[data-ad-format='native'] { max-width: 1040px; }
.ad-slot[data-ad-format='article'] { width: min(calc(100% - 20px), 760px); }
.ad-slot--in-article { margin-block: 42px; }
.ad-slot--article-lead { margin-block: 22px 34px; }
.ad-slot--compact { --ad-min-desktop: 112px; --ad-min-mobile: 104px; margin-block: 24px; }
@keyframes ad-shimmer { to { background-position: -140% 0; } }
@media (max-width: 720px) {
  .ad-slot { width: calc(100% - 20px); min-height: var(--ad-min-mobile); margin-block: 24px; padding-inline: 10px; border-radius: 11px; }
  .ad-slot__mount, .ad-network-placement { min-height: calc(var(--ad-min-mobile) - 38px); }
}
@media (prefers-reduced-motion: reduce) { .ad-slot__mount::before { animation: none !important; } }
''')

# ---------------------------------------------------------------------------
# Server routes, magazine, content operations and HTML ad reservation
replace_once(
    'src/server/app.js',
    "import { advertisingConfig, advertisingCspSources } from './ads.js';",
    "import { advertisingConfig, advertisingCspSources, prepareAdvertisingHtml } from './ads.js';",
)
replace_once(
    'src/server/app.js',
    "import { getLearnArticle, renderLearnArticle } from './learn-content.js';",
    """import { getLearnArticle, renderLearnArticle } from './learn-content.js';
import { getEditorialArticle, renderArticlesIndex, renderEditorialArticle } from './article-content.js';
import { contentInventory } from './content-registry.js';
import { buildContentOperations } from './content-operations.js';""",
)
replace_once(
    'src/server/app.js',
    "const ANALYTICS_HTML = path.join(PUBLIC_DIR, 'analytics.html');",
    """const ANALYTICS_HTML = path.join(PUBLIC_DIR, 'analytics.html');
const CONTENT_ADMIN_HTML = path.join(PUBLIC_DIR, 'content-admin.html');
const ABOUT_HTML = path.join(PUBLIC_DIR, 'about.html');
const EDITORIAL_POLICY_HTML = path.join(PUBLIC_DIR, 'editorial-policy.html');""",
)
replace_once(
    'src/server/app.js',
    "const ADVERTISING_PATHS = new Set(['/', '/templates', '/learn']);\nconst TRACKED_PATHS = new Set(['/', '/editor', '/templates', '/learn', '/privacy', '/terms']);",
    """const ADVERTISING_PATHS = new Set(['/', '/templates', '/learn', '/articles']);
const TRACKED_PATHS = new Set(['/', '/editor', '/templates', '/learn', '/articles', '/about', '/editorial-policy', '/privacy', '/terms']);""",
)
replace_once(
    'src/server/app.js',
    "return ADVERTISING_PATHS.has(pathname) || pathname.startsWith('/learn/');",
    "return ADVERTISING_PATHS.has(pathname) || pathname.startsWith('/learn/') || pathname.startsWith('/articles/');",
)
replace_once(
    'src/server/app.js',
    "return TRACKED_PATHS.has(pathname) || pathname.startsWith('/learn/');",
    "return TRACKED_PATHS.has(pathname) || pathname.startsWith('/learn/') || pathname.startsWith('/articles/');",
)
replace_once(
    'src/server/app.js',
    """  if (seo) {
    const enhanced = enhanceHtml(html, pathname, state.seo);
    html = enhanced.html;
    meta = enhanced.meta;
  }
  if (track) html = injectAnalyticsScript(html, pathname, state.analytics);
""",
    """  if (seo) {
    const enhanced = enhanceHtml(html, pathname, state.seo);
    html = enhanced.html;
    meta = enhanced.meta;
  }
  if (advertisingAllowed(pathname)) html = prepareAdvertisingHtml(html, state.environment);
  if (track) html = injectAnalyticsScript(html, pathname, state.analytics);
""",
)
replace_once(
    'src/server/app.js',
    """  app.get('/admin/analytics', adminAuth, (req, res) => sendHtml(req, res, ANALYTICS_HTML, { pathname: '/admin/analytics', seo: false, track: false }, state));
  app.get('/analytics.html', (_req, res) => res.redirect(302, '/admin/analytics'));
""",
    """  app.get('/admin/analytics', adminAuth, (req, res) => sendHtml(req, res, ANALYTICS_HTML, { pathname: '/admin/analytics', seo: false, track: false }, state));
  app.get('/admin/content', adminAuth, (req, res) => sendHtml(req, res, CONTENT_ADMIN_HTML, { pathname: '/admin/content', seo: false, track: false }, state));
  app.get('/analytics.html', (_req, res) => res.redirect(302, '/admin/analytics'));
""",
)
insert_before(
    'src/server/app.js',
    "  app.get('/api/admin/goals', adminLimit, adminAuth, async (_req, res, next) => {",
    """  app.get('/api/admin/content/overview', adminLimit, adminAuth, async (req, res, next) => {
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

""",
)
replace_once(
    'src/server/app.js',
    """  app.get('/learn/:slug', (req, res, next) => {
    if (!getLearnArticle(req.params.slug)) return next();
    return sendHtmlSource(req, res, renderLearnArticle(req.params.slug), { pathname: `/learn/${req.params.slug}` }, state);
  });
  app.get('/headless',""",
    """  app.get('/learn/:slug', (req, res, next) => {
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
  app.get('/headless',""",
)
replace_once(
    'src/server/app.js',
    "product: { defaultLanguage: 'fa', languages: ['fa'], safeMode: true, localPreview: true },",
    "product: { defaultLanguage: 'fa', languages: ['fa'], safeMode: true, localPreview: true, magazine: true, contentOperations: true },",
)

# ---------------------------------------------------------------------------
# SEO: magazine, author transparency and full content sitemap
replace_once(
    'src/server/seo.js',
    "import { LEARN_ARTICLES, getLearnArticle, learnSitemapEntries } from './learn-content.js';",
    """import { LEARN_ARTICLES, getLearnArticle, learnSitemapEntries } from './learn-content.js';
import { EDITORIAL_ARTICLES, getEditorialArticle, articleSitemapEntries } from './article-content.js';""",
)
replace_once(
    'src/server/seo.js',
    """  '/privacy': {
""",
    """  '/articles': {
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
""",
)
replace_once(
    'src/server/seo.js',
    'function pageStructuredData(pathname, meta, config, article) {',
    'function pageStructuredData(pathname, meta, config, article, editorialArticle) {',
)
replace_once(
    'src/server/seo.js',
    """  } else if (article) {
    const articleId = `${canonical}#article`;
""",
    """  } else if (pathname === '/articles') {
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
""",
)
replace_once(
    'src/server/seo.js',
    """  const articleSlug = normalized.startsWith('/learn/') ? normalized.slice('/learn/'.length) : '';
  const article = articleSlug ? getLearnArticle(articleSlug) : null;
  if (article) {
""",
    """  const articleSlug = normalized.startsWith('/learn/') ? normalized.slice('/learn/'.length) : '';
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
""",
)
replace_once(
    'src/server/seo.js',
    'const structured = pageStructuredData(meta.pathname, meta, config, meta.article);',
    'const structured = pageStructuredData(meta.pathname, meta, config, meta.article, meta.editorialArticle);',
)
replace_once(
    'src/server/seo.js',
    """    ...learnSitemapEntries(),
  ];
""",
    """    ...learnSitemapEntries(),
    ...articleSitemapEntries(),
  ];
""",
)
replace_once(
    'src/server/seo.js',
    """  const articles = LEARN_ARTICLES.map((article) => `- [${article.title}](${origin}/learn/${article.slug}): ${article.description}`).join('\n');
  return `# ${config.siteName}\n\n> ابزار رایگان و فارسی برای نوشتن، پیش‌نمایش و خروجی گرفتن از نمودارهای Mermaid. این پروژه مستقل و متن‌باز است و وابستگی رسمی به پروژه Mermaid ندارد.\n\n## صفحات اصلی\n\n- [ادیتور](${origin}/editor): پیش‌نمایش زنده و خروجی SVG، PNG، JPG، WebP و PDF.\n- [قالب‌ها](${origin}/templates): نمونه‌های قابل ویرایش فلوچارت، Sequence، ERD، UML و Gantt.\n- [مرکز آموزش](${origin}/learn): راهنماهای فارسی و مثال‌های عملی.\n\n## راهنماها\n\n${articles}\n\n## سیاست داده\n\nآنالیز محصول first-party و تجمیعی است؛ کد Mermaid، متن نمودار و IP خام ذخیره نمی‌شوند.\n`;
""",
    """  const guides = LEARN_ARTICLES.map((article) => `- [${article.title}](${origin}/learn/${article.slug}): ${article.description}`).join('\n');
  const magazine = EDITORIAL_ARTICLES.map((article) => `- [${article.title}](${origin}/articles/${article.slug}): ${article.description}`).join('\n');
  return `# ${config.siteName}\n\n> ابزار رایگان و فارسی برای نوشتن، پیش‌نمایش و خروجی گرفتن از نمودارهای Mermaid؛ همراه با آموزش مثال‌محور و مقاله‌های تحلیلی دربارهٔ مستندسازی.\n\n## صفحات اصلی\n\n- [ادیتور](${origin}/editor): پیش‌نمایش زنده و خروجی SVG، PNG، JPG، WebP و PDF.\n- [قالب‌ها](${origin}/templates): نمونه‌های قابل ویرایش.\n- [مرکز آموزش](${origin}/learn): راهنماهای عملی Mermaid.\n- [مقاله‌ها](${origin}/articles): Diagram as Code، معماری و نگهداری مستندات.\n- [سیاست تحریریه](${origin}/editorial-policy): روش نویسندگی، تست و به‌روزرسانی.\n\n## راهنماها\n\n${guides}\n\n## مقاله‌های تحلیلی\n\n${magazine}\n\n## سیاست داده\n\nآنالیز محصول first-party و تجمیعی است؛ کد Mermaid، متن نمودار و IP خام ذخیره نمی‌شوند.\n`;
""",
)
replace_once(
    'src/server/seo.js',
    """    '/learn/': '/learn', '/editor/': '/editor', '/index.html': '/editor',
    '/privacy/': '/privacy', '/privacy.html': '/privacy',
""",
    """    '/learn/': '/learn', '/articles/': '/articles', '/about/': '/about', '/editorial-policy/': '/editorial-policy',
    '/editor/': '/editor', '/index.html': '/editor',
    '/privacy/': '/privacy', '/privacy.html': '/privacy',
""",
)
# Update old social image wording/colors without touching functionality.
seo_text = read('src/server/seo.js').replace('Mermaid Studio</text>', 'نمودارا</text>').replace('نمودار حرفه‌ای، فقط با چند خط کد', 'نمودار به‌صورت کد؛ روشن و قابل نگهداری').replace('#8b5cf6', '#1f5b43').replace('#ec4899', '#d55f39')
write('src/server/seo.js', seo_text)

replace_once(
    'src/server/seo-audit.js',
    "import { LEARN_ARTICLES } from './learn-content.js';",
    """import { LEARN_ARTICLES } from './learn-content.js';
import { EDITORIAL_ARTICLES } from './article-content.js';""",
)
replace_once(
    'src/server/seo-audit.js',
    """  '/learn',
  ...LEARN_ARTICLES.map((article) => `/learn/${article.slug}`),
  '/privacy',
""",
    """  '/learn',
  ...LEARN_ARTICLES.map((article) => `/learn/${article.slug}`),
  '/articles',
  ...EDITORIAL_ARTICLES.map((article) => `/articles/${article.slug}`),
  '/about',
  '/editorial-policy',
  '/privacy',
""",
)

# ---------------------------------------------------------------------------
# Professional editor shell, API and diagnostics
replace_once(
    'public/index.html',
    '<meta name="description" content="ادیتور فارسی Mermaid Studio با پیش‌نمایش زنده و خروجی SVG، PNG، JPG، WebP و PDF" />',
    '<meta name="description" content="ادیتور حرفه‌ای نمودارا برای Mermaid؛ فرمان سریع، تشخیص خطا، پیش‌نمایش زنده و خروجی SVG، PNG، WebP و PDF." />',
)
replace_once('public/index.html', '<title>ادیتور Mermaid Studio</title>', '<title>نمودارا | ادیتور حرفه‌ای Mermaid</title>')
replace_once(
    'public/index.html',
    '    <link rel="stylesheet" href="/css/persian.css?v=%V%" />',
    '    <link rel="stylesheet" href="/css/persian.css?v=%V%" />\n    <link rel="stylesheet" href="/css/editor-experience.css?v=%V%" />',
)
replace_once(
    'public/index.html',
    """      <div class="brand brand-home">
        <a class="logo" href="/" title="بازگشت به صفحه اصلی" aria-label="صفحه اصلی">
          <svg viewBox="0 0 32 32" width="26" height="26">
            <defs>
              <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stop-color="#b16cea" />
                <stop offset="1" stop-color="#ff5e92" />
              </linearGradient>
            </defs>
            <rect width="32" height="32" rx="9" fill="url(#g)" />
            <path d="M7 22V11l5 6 5-6v11M22 11c3 0 4 2 4 4 0 4-5 4-5 7" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </a>
        <div class="brand-text"><strong>Mermaid Studio</strong><small>ادیتور محلی و خصوصی نمودار</small></div>
      </div>

      <div class="toolbar-group file-actions">""",
    """      <div class="brand brand-home">
        <a class="logo" href="/" title="بازگشت به نمودارا" aria-label="صفحهٔ اصلی نمودارا"><img src="/logo.svg" width="30" height="30" alt="" /></a>
        <div class="brand-text"><strong>نمودارا</strong><small>ادیتور Mermaid برای کار واقعی</small></div>
      </div>

      <button id="btn-command" class="icon-btn command-trigger" type="button" title="فرمان‌ها و درج سریع"><span>فرمان‌ها</span><kbd>Ctrl K</kbd></button>

      <div class="toolbar-group file-actions">""",
)
replace_once(
    'public/index.html',
    '    <main class="workspace" id="workspace">',
    """    <nav class="mobile-pane-switch" aria-label="انتخاب نمای موبایل">
      <button type="button" class="active" data-mobile-pane="editor" aria-pressed="true">کد</button>
      <button type="button" data-mobile-pane="preview" aria-pressed="false">پیش‌نمایش</button>
    </nav>

    <main class="workspace" id="workspace">""",
)
replace_once(
    'public/index.html',
    """          <span class="eh-label">کد Mermaid</span>
          <span class="spacer"></span>
""",
    """          <span class="eh-label">کد Mermaid</span>
          <div class="document-state"><strong id="document-name">untitled.mmd</strong><span id="save-state">ذخیرهٔ محلی</span></div>
          <span class="spacer"></span>
""",
)
replace_once(
    'public/index.html',
    """        <footer class="status-bar">
""",
    """        <section id="diagnostics-panel" class="diagnostics-panel is-clean" aria-label="تشخیص خطا">
          <div class="diagnostics-head"><button id="diagnostics-toggle" type="button" aria-expanded="false"><span id="diagnostics-status">بدون خطا</span><strong id="diagnostics-title">نمودار آماده است</strong><span class="diagnostics-chevron">⌄</span></button></div>
          <div class="diagnostics-content"><div id="diagnostics-body"></div><div id="diagnostics-actions"></div></div>
        </section>
        <footer class="status-bar">
""",
)
replace_once(
    'public/index.html',
    '<div><kbd>Ctrl/⌘</kbd>+<kbd>K</kbd><span>کپی لینک اشتراک‌گذاری</span></div>',
    '<div><kbd>Ctrl/⌘</kbd>+<kbd>K</kbd><span>فرمان‌ها و درج سریع</span></div>\n          <div><kbd>Ctrl/⌘</kbd>+<kbd>Shift</kbd>+<kbd>K</kbd><span>کپی لینک اشتراک‌گذاری</span></div>',
)
insert_before(
    'public/index.html',
    '    <input id="file-input"',
    """    <div id="command-modal" class="command-modal" aria-hidden="true">
      <section class="command-card" role="dialog" aria-modal="true" aria-labelledby="command-title">
        <div class="command-search"><span aria-hidden="true">⌕</span><input id="command-input" type="search" autocomplete="off" placeholder="فرمان، نوع نمودار یا قطعه‌کد…" aria-label="جست‌وجوی فرمان" /><button id="command-close" type="button" aria-label="بستن">✕</button></div>
        <h2 id="command-title" class="sr-only">فرمان‌های ادیتور</h2>
        <div id="command-list" class="command-list"></div>
      </section>
    </div>

""",
)
replace_once(
    'public/index.html',
    '    <script type="module" src="/js/app.js?v=%V%"></script>',
    '    <script type="module" src="/js/app.js?v=%V%"></script>\n    <script type="module" src="/js/editor-experience.js?v=%V%"></script>',
)

# Editor wrapper capabilities.
replace_once(
    'public/js/editor.js',
    """        setValue: (v) => cm.setValue(v),
        focus: () => cm.focus(),
""",
    """        setValue: (v) => cm.setValue(v),
        replaceSelection: (v) => cm.replaceSelection(String(v)),
        setCursor: (line, col = 1) => { cm.setCursor({ line: Math.max(0, Number(line) - 1), ch: Math.max(0, Number(col) - 1) }); cm.focus(); },
        getLine: (line) => cm.getLine(Math.max(0, Number(line) - 1)) || '',
        lineCount: () => cm.lineCount(),
        focus: () => cm.focus(),
""",
)
replace_once(
    'public/js/editor.js',
    """    setValue: (v) => {
      textarea.value = v;
    },
    focus: () => textarea.focus(),
""",
    """    setValue: (v) => {
      textarea.value = v;
    },
    replaceSelection: (v) => {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      textarea.setRangeText(String(v), start, end, 'end');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    },
    setCursor: (line, col = 1) => {
      const lines = textarea.value.split('\n');
      const targetLine = Math.min(lines.length, Math.max(1, Number(line) || 1));
      const offset = lines.slice(0, targetLine - 1).reduce((sum, item) => sum + item.length + 1, 0) + Math.max(0, Number(col) - 1);
      textarea.selectionStart = textarea.selectionEnd = Math.min(offset, textarea.value.length);
      textarea.focus();
    },
    getLine: (line) => textarea.value.split('\n')[Math.max(0, Number(line) - 1)] || '',
    lineCount: () => textarea.value.split('\n').length,
    focus: () => textarea.focus(),
""",
)

# Controller events/API and sober starter content.
replace_once(
    'public/js/app.js',
    """const FALLBACK_DIAGRAM = `flowchart TD
    A[شروع] --> B{همه‌چیز درست است؟}
    B -- بله --> C[انتشار نمودار 🚀]
    B -- خیر --> D[بررسی و رفع خطا]
    D --> B
    C --> E[تمام 🎉]`;""",
    """const FALLBACK_DIAGRAM = `flowchart TD
    A[دریافت درخواست] --> B{اطلاعات کامل است؟}
    B -- بله --> C[بررسی کارشناس]
    B -- خیر --> D[تکمیل اطلاعات]
    D --> B
    C --> E[اعلام نتیجه]`;""",
)
replace_once(
    'public/js/app.js',
    """  } catch {
    /* Local storage can be unavailable or full. Editing must still work. */
  }
}
""",
    """  } catch {
    /* Local storage can be unavailable or full. Editing must still work. */
  }
  window.dispatchEvent(new CustomEvent('nemodara:autosaved', { detail: { at: Date.now() } }));
}
""",
)
replace_once(
    'public/js/app.js',
    """function showError(error) {
  $('#preview-error-text').textContent = friendlyError(error);
  $('#preview-error').classList.add('show');
}
""",
    """function showError(error) {
  const raw = error?.message || String(error || '');
  const line = Number(/line\\s+(\\d+)/i.exec(raw)?.[1] || /line:\\s*(\\d+)/i.exec(raw)?.[1] || 0);
  const message = friendlyError(error);
  $('#preview-error-text').textContent = message;
  $('#preview-error').classList.add('show');
  window.dispatchEvent(new CustomEvent('nemodara:diagnostic', { detail: { ok: false, line, raw, message, summary: line ? `خط ${faNumber(line)} و خط قبل را بررسی کن.` : 'ساختار این بخش با سینتکس Mermaid هماهنگ نیست.' } }));
}
""",
)
replace_once(
    'public/js/app.js',
    """    hideError();
    enableExports(false);
    return;
""",
    """    hideError();
    window.dispatchEvent(new CustomEvent('nemodara:diagnostic', { detail: { ok: true, type: '', elapsed: 0 } }));
    enableExports(false);
    return;
""",
)
replace_once(
    'public/js/app.js',
    """    setStatus(`آماده در ${faNumber(elapsed)} میلی‌ثانیه`, 'ok');
    $('#dims').textContent = `${faNumber(Math.round(rect.width))} × ${faNumber(Math.round(rect.height))} پیکسل`;
""",
    """    setStatus(`آماده در ${faNumber(elapsed)} میلی‌ثانیه`, 'ok');
    $('#dims').textContent = `${faNumber(Math.round(rect.width))} × ${faNumber(Math.round(rect.height))} پیکسل`;
    window.dispatchEvent(new CustomEvent('nemodara:diagnostic', { detail: { ok: true, type: TYPE_LABELS[detected] || detected || 'نمودار', elapsed } }));
""",
)
replace_once(
    'public/js/app.js',
    """function loadFileText(text, name) {
  editor.setValue(text);
  render();
  toast(`فایل «${name}» باز شد.`, 'ok');
}

function saveFile() {
  const blob = new Blob([editor.getValue()], { type: 'text/plain;charset=utf-8' });
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(blob);
  anchor.download = 'diagram.mmd';
""",
    """function loadFileText(text, name) {
  editor.setValue(text);
  const safeName = String(name || 'untitled.mmd').replace(/[^A-Za-z0-9._-]/g, '-').slice(0, 100) || 'untitled.mmd';
  $('#document-name').textContent = safeName;
  render();
  toast(`فایل «${name}» باز شد.`, 'ok');
}

function saveFile() {
  const blob = new Blob([editor.getValue()], { type: 'text/plain;charset=utf-8' });
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(blob);
  anchor.download = $('#document-name')?.textContent || 'diagram.mmd';
""",
)
# Remove obsolete sponsor setup and call.
app_text = read('public/js/app.js')
start = app_text.find('function configureSponsor(meta) {')
if start >= 0:
    end = app_text.find('\nfunction closeModal', start)
    if end < 0:
        raise SystemExit('configureSponsor end marker missing')
    app_text = app_text[:start] + app_text[end + 1:]
app_text = app_text.replace('  configureSponsor(meta);\n', '')
write('public/js/app.js', app_text)
replace_once(
    'public/js/app.js',
    """    editor.setValue('');
    render();
    editor.focus();
""",
    """    editor.setValue('');
    $('#document-name').textContent = 'untitled.mmd';
    render();
    editor.focus();
""",
)
replace_once(
    'public/js/app.js',
    """    } else if (modifier && key === 'k') {
      event.preventDefault();
      $('#btn-share').click();
""",
    """    } else if (modifier && key === 'k' && event.shiftKey) {
      event.preventDefault();
      $('#btn-share').click();
""",
)
insert_before(
    'public/js/app.js',
    """  enableExports(false);
  editor.refresh?.();
""",
    """  function insertCode(code) {
    const current = editor.getValue();
    const prefix = current && !current.endsWith('\n') ? '\n' : '';
    editor.replaceSelection(`${prefix}${String(code || '')}\n`);
    render();
    editor.focus();
  }
  window.nemodaraEditor = Object.freeze({
    getCode: () => editor.getValue(),
    setCode: (code) => { editor.setValue(String(code || '')); render(); },
    insert: insertCode,
    focus: () => editor.focus(),
    refresh: () => editor.refresh?.(),
    fit,
    render,
    share,
    saveFile,
    openExportDialog,
    goToLine: (line) => editor.setCursor?.(line, 1),
  });
  window.dispatchEvent(new CustomEvent('nemodara:editor-ready'));

""",
)

# ---------------------------------------------------------------------------
# Landing: connect the new magazine and author pages.
replace_once(
    'public/landing.html',
    """        <a href="/learn">آموزش</a>
        <a href="/templates">قالب‌ها</a>
""",
    """        <a href="/learn">آموزش</a>
        <a href="/articles">مقاله‌ها</a>
        <a href="/templates">قالب‌ها</a>
""",
)
replace_once(
    'public/landing.html',
    """            <a href="/learn">آموزش فارسی</a>
            <a href="/templates">قالب‌های آماده</a>
""",
    """            <a href="/learn">آموزش فارسی</a>
            <a href="/articles">مقاله‌ها</a>
            <a href="/templates">قالب‌های آماده</a>
            <a href="/about">دربارهٔ نمودارا</a>
""",
)
insert_before(
    'public/landing.html',
    '      <section id="privacy"',
    """      <section class="editorial-preview section-shell section-block" aria-labelledby="editorial-title">
        <div class="section-intro section-intro--split"><div><p class="section-kicker">مجلهٔ نمودارا</p><h2 id="editorial-title">چیزهایی که سینتکس به‌تنهایی توضیح نمی‌دهد.</h2></div><p>دربارهٔ انتخاب ابزار، نگهداری مستندات و مرزهایی می‌نویسیم که در پروژهٔ واقعی مهم‌اند؛ با مثال اجراشده و بدون وعده‌های مطلق.</p></div>
        <div class="editorial-story-grid">
          <a href="/articles/diagram-as-code-for-teams"><span>مستندسازی</span><h3>نمودار به‌صورت کد؛ چه وقت انتخاب خوبی است و چه وقت نه؟</h3><p>مزیت نسخه‌پذیری مهم است، اما هر نموداری ارزش تبدیل‌شدن به متن را ندارد.</p><small>۱۱ دقیقه مطالعه</small></a>
          <a href="/articles/choose-the-right-diagram"><span>راهنمای انتخاب</span><h3>فلوچارت، Sequence یا ERD؟</h3><p>نوع نمودار را از روی سؤال مخاطب انتخاب کن، نه از روی منوی ابزار.</p><small>۱۳ دقیقه مطالعه</small></a>
          <a href="/articles/architecture-documentation-that-lasts"><span>معماری نرم‌افزار</span><h3>نموداری که سه ماه بعد هنوز مفید باشد</h3><p>محدوده، نام‌گذاری و مالکیت، مهم‌تر از تعداد جعبه‌ها هستند.</p><small>۱۴ دقیقه مطالعه</small></a>
        </div>
        <div class="section-footer-link"><a href="/articles">رفتن به همهٔ مقاله‌ها <span aria-hidden="true">←</span></a><a href="/editorial-policy">روش نوشتن و بازبینی محتوا</a></div>
      </section>

""",
)
replace_once(
    'public/landing.html',
    '<nav aria-label="پیوندهای پایین صفحه"><a href="/learn">آموزش</a><a href="/templates">قالب‌ها</a><a href="/privacy">حریم خصوصی</a><a href="/terms">شرایط استفاده</a></nav>',
    '<nav aria-label="پیوندهای پایین صفحه"><a href="/learn">آموزش</a><a href="/articles">مقاله‌ها</a><a href="/templates">قالب‌ها</a><a href="/about">درباره</a><a href="/editorial-policy">سیاست تحریریه</a><a href="/privacy">حریم خصوصی</a></nav>',
)
append_css = r'''

.editorial-story-grid { margin-top: 34px; display: grid; grid-template-columns: 1.35fr 1fr 1fr; border-block: 1px solid var(--border); }
.editorial-story-grid > a { min-height: 280px; padding: 28px; display: flex; flex-direction: column; border-inline-start: 1px solid var(--border); }
.editorial-story-grid > a:first-child { border-inline-start: 0; }
.editorial-story-grid span { color: var(--accent); font-size: 11px; }
.editorial-story-grid h3 { margin: 20px 0 12px; font-size: clamp(20px, 2.3vw, 30px); line-height: 1.5; }
.editorial-story-grid p { margin: 0; color: var(--muted); line-height: 2; font-size: 13px; }
.editorial-story-grid small { margin-top: auto; padding-top: 24px; color: var(--muted-2); }
.editorial-story-grid > a:hover h3 { color: var(--accent); }
@media (max-width: 850px) { .editorial-story-grid { grid-template-columns: 1fr; } .editorial-story-grid > a { min-height: 0; border-inline-start: 0; border-block-start: 1px solid var(--border); } .editorial-story-grid > a:first-child { border-block-start: 0; } }
'''
if '.editorial-story-grid {' not in read('public/css/landing-sections.css'):
    write('public/css/landing-sections.css', read('public/css/landing-sections.css') + append_css)

# ---------------------------------------------------------------------------
# Admin: brand, content operations link and transparent revenue planner.
analytics = read('public/analytics.html').replace('<title>مرکز کنترل رشد | Mermaid Studio</title>', '<title>مرکز کنترل رشد | نمودارا</title>').replace('صفحه اصلی Mermaid Studio', 'صفحهٔ اصلی نمودارا').replace('<strong>Mermaid Studio</strong>', '<strong>نمودارا</strong>').replace('Growth Intelligence', 'Nemodara Growth Intelligence')
nav_marker = '          <button class="admin-nav-item" type="button" data-admin-view="settings"><span>⚙</span><b>اهداف و داده</b><small>تنظیمات و رویدادها</small></button>\n'
if '/admin/content' not in analytics:
    analytics = analytics.replace(nav_marker, nav_marker + '          <a class="admin-nav-item" href="/admin/content"><span>✎</span><b>عملیات محتوا</b><small>Brief، تقویم و سلامت صفحات</small></a>\n')
revenue_anchor = '          <section class="dashboard-grid">\n            <article class="panel span-7"><div class="panel-head"><div><h3>روند درآمد، نمایش و کلیک</h3>'
planner = '''          <section class="dashboard-grid">\n            <article class="panel span-12 revenue-planner"><div class="panel-head"><div><h3>مدل‌سازی سناریوی درآمد</h3><p>یک تخمین شفاف برای تصمیم‌گیری؛ گزارش پنل ناشر همچنان منبع نهایی است.</p></div><span class="panel-tag">Scenario model</span></div><form id="revenue-planner-form"><div class="form-grid"><label>Pageview ماهانه<input id="planner-pageviews" type="number" min="0" value="0" /></label><label>Page RPM (ریال)<input id="planner-rpm" type="number" min="0" value="0" /></label><label>رشد ترافیک (%)<input id="planner-growth" type="number" min="-90" max="500" step="1" value="0" /></label><label>Fill rate (%)<input id="planner-fill" type="number" min="0" max="100" value="70" /></label><label>Viewability (%)<input id="planner-viewability" type="number" min="0" max="100" value="70" /></label><div class="metric-box"><span>بازدید پیش‌بینی‌شده</span><strong id="planner-projected-views">—</strong></div></div><div class="scenario-grid"><div><span>محافظه‌کارانه</span><strong id="planner-conservative">—</strong></div><div class="is-primary"><span>سناریوی پایه</span><strong id="planner-base">—</strong></div><div><span>خوش‌بینانه</span><strong id="planner-optimistic">—</strong></div></div><p id="planner-note" class="form-message"></p></form></article>\n            <article class="panel span-7"><div class="panel-head"><div><h3>روند درآمد، نمایش و کلیک</h3>'''
if 'id="revenue-planner-form"' not in analytics:
    if revenue_anchor not in analytics:
        raise SystemExit('Revenue dashboard anchor not found')
    analytics = analytics.replace(revenue_anchor, planner, 1)
analytics = analytics.replace('    <script type="module" src="/js/analytics-dashboard.js?v=%V%"></script>', '    <script type="module" src="/js/analytics-dashboard.js?v=%V%"></script>\n    <script type="module" src="/js/revenue-planner.js?v=%V%"></script>')
write('public/analytics.html', analytics)

analytics_css = read('public/css/analytics.css')
planner_css = r'''

.revenue-planner .form-grid { grid-template-columns: repeat(6, minmax(0, 1fr)); }
.scenario-grid { margin-top: 14px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 9px; }
.scenario-grid > div { padding: 14px; border: 1px solid var(--a-border); border-radius: 12px; background: var(--a-panel-2); }
.scenario-grid > div.is-primary { border-color: rgba(67,216,164,.4); background: rgba(67,216,164,.06); }
.scenario-grid span { color: var(--a-muted); font-size: 9px; }
.scenario-grid strong { display: block; margin-top: 7px; direction: ltr; text-align: right; font-size: 18px; }
@media (max-width: 1180px) { .revenue-planner .form-grid { grid-template-columns: repeat(3, 1fr); } }
@media (max-width: 620px) { .revenue-planner .form-grid, .scenario-grid { grid-template-columns: 1fr; } }
'''
if '.revenue-planner .form-grid' not in analytics_css:
    write('public/css/analytics.css', analytics_css + planner_css)

# ---------------------------------------------------------------------------
# Environment, package scripts and documentation metadata.
for env_file in ['.env.example', '.env.local.example']:
    text = read(env_file)
    marker = 'ADS_SLOT_LEARN_INLINE=\n'
    if 'ADS_SLOT_ARTICLES_TOP=' not in text:
        addition = '''ADS_SLOT_LEARN_FEED=
ADS_SLOT_ARTICLES_TOP=
ADS_SLOT_ARTICLES_INLINE=
ADS_SLOT_ARTICLE_TOP=
ADS_SLOT_ARTICLE_MID=
ADS_SLOT_ARTICLE_END=
'''
        if marker in text:
            text = text.replace(marker, marker + addition, 1)
        else:
            # Local template intentionally has no placement list; integrations remain disabled.
            text = text.rstrip() + '\n# Article placements are configured only in production.\n' + addition
    write(env_file, text)

package_path = ROOT / 'package.json'
package = json.loads(package_path.read_text(encoding='utf-8'))
package['version'] = '1.7.0'
package['description'] = 'Nemodara: a professional Persian Mermaid editor, tested editorial magazine, CLS-safe advertising and content revenue operations.'
checks = [
    'public/js/editor-experience.js',
    'public/js/content-admin.js',
    'public/js/revenue-planner.js',
    'src/server/article-content.js',
    'src/server/content-registry.js',
    'src/server/content-operations.js',
]
check_script = package['scripts']['check']
for file in checks:
    command = f'node --check {file}'
    if command not in check_script:
        check_script += f' && {command}'
package['scripts']['check'] = check_script
product_tests = package['scripts']['test:product']
for test_file in ['tests/product-growth-v3.test.mjs', 'tests/editor-professional.test.mjs']:
    if test_file not in product_tests:
        product_tests = product_tests.replace('tests/editorial-pages.test.mjs', f'tests/editorial-pages.test.mjs {test_file}', 1)
package['scripts']['test:product'] = product_tests
package['scripts']['test:growth-v3'] = 'node --test tests/product-growth-v3.test.mjs tests/editor-professional.test.mjs'
for keyword in ['editorial-workflow', 'content-brief', 'ad-revenue', 'command-palette', 'diagram-as-code']:
    if keyword not in package.setdefault('keywords', []):
        package['keywords'].append(keyword)
package_path.write_text(json.dumps(package, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

lock_path = ROOT / 'package-lock.json'
lock = json.loads(lock_path.read_text(encoding='utf-8'))
lock['version'] = '1.7.0'
if '' in lock.get('packages', {}):
    lock['packages']['']['version'] = '1.7.0'
lock_path.write_text(json.dumps(lock, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

print('Nemodara product growth v3 finalization applied.')
