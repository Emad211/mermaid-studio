/**
 * Mermaid Studio HTTP server.
 *
 * Public product routes:
 *   /                Persian landing page
 *   /editor           Mermaid editor
 *   /headless         internal Puppeteer renderer
 *   /api/render       protected render API
 *   /api/meta         product capabilities and public configuration
 */

import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const NM = path.join(ROOT, 'node_modules');
const require = createRequire(import.meta.url);
const pkg = require('../../package.json');

const BUILD = `${pkg.version}.${Date.now().toString(36)}`;
const LANDING_HTML = path.join(PUBLIC_DIR, 'index.html');
const EDITOR_HTML = path.join(PUBLIC_DIR, 'editor.html');
const HEADLESS_HTML = path.join(PUBLIC_DIR, 'headless.html');

const PUBLIC_MODE = process.env.MSTUDIO_PUBLIC_MODE === '1' || process.env.NODE_ENV === 'production';
const ALLOW_UNSAFE_MERMAID = process.env.MSTUDIO_ALLOW_UNSAFE_MERMAID === '1';

function intFromEnv(name, fallback, min, max) {
  const parsed = Number.parseInt(process.env[name] || '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

const MAX_CODE_LENGTH = intFromEnv('MSTUDIO_MAX_CODE_LENGTH', 120_000, 1_000, 500_000);
const MAX_CSS_LENGTH = intFromEnv('MSTUDIO_MAX_CSS_LENGTH', 20_000, 0, 100_000);
const MAX_CONFIG_LENGTH = intFromEnv('MSTUDIO_MAX_CONFIG_LENGTH', 40_000, 1_000, 200_000);
const MAX_RENDER_CONCURRENCY = intFromEnv('MSTUDIO_RENDER_CONCURRENCY', PUBLIC_MODE ? 2 : 4, 1, 12);
const MAX_RENDER_QUEUE = intFromEnv('MSTUDIO_RENDER_QUEUE', PUBLIC_MODE ? 20 : 100, 0, 500);
const RATE_LIMIT_PER_MINUTE = intFromEnv('MSTUDIO_RATE_LIMIT', PUBLIC_MODE ? 40 : 600, 1, 10_000);

const ICON_PACKS = ['logos', 'mdi', 'fa6-solid', 'fa6-brands'];
const DIAGRAM_TYPES = [
  'flowchart', 'sequence', 'class', 'state', 'entity-relationship', 'user journey',
  'gantt', 'pie', 'quadrant', 'requirement', 'gitgraph', 'C4', 'mindmap', 'timeline',
  'sankey', 'xychart', 'block', 'packet', 'kanban', 'architecture', 'radar', 'zenuml',
];

function safeHttpUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

const SPONSOR_URL = safeHttpUrl(process.env.SPONSOR_URL);
const SPONSOR = process.env.SPONSOR_NAME && SPONSOR_URL
  ? {
      name: String(process.env.SPONSOR_NAME).slice(0, 80),
      url: SPONSOR_URL,
      note: String(process.env.SPONSOR_NOTE || '').slice(0, 180) || undefined,
    }
  : null;

function renderPage(filePath, res) {
  let html = fs.readFileSync(filePath, 'utf8');
  html = html.split('%V%').join(BUILD);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.send(html);
}

function jsType(res, filePath) {
  if (filePath.endsWith('.mjs') || filePath.endsWith('.js')) {
    res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
  }
}

function vendorHeaders(res, filePath) {
  jsType(res, filePath);
  res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
}

function appHeaders(res, filePath) {
  jsType(res, filePath);
  if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-store');
  else res.setHeader('Cache-Control', 'public, max-age=300');
}

function securityHeaders(_req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "worker-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'self'",
    ].join('; '),
  );
  next();
}

const rateBuckets = new Map();
const RATE_WINDOW_MS = 60_000;

function cleanupRateBuckets() {
  const oldest = Date.now() - RATE_WINDOW_MS * 2;
  for (const [key, bucket] of rateBuckets) {
    if (bucket.startedAt < oldest) rateBuckets.delete(key);
  }
}

const cleanupTimer = setInterval(cleanupRateBuckets, RATE_WINDOW_MS);
cleanupTimer.unref?.();

function renderRateLimit(req, res, next) {
  const key = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  let bucket = rateBuckets.get(key);

  if (!bucket || now - bucket.startedAt >= RATE_WINDOW_MS) {
    bucket = { startedAt: now, count: 0 };
    rateBuckets.set(key, bucket);
  }

  bucket.count += 1;
  const remaining = Math.max(0, RATE_LIMIT_PER_MINUTE - bucket.count);
  const resetSeconds = Math.ceil((bucket.startedAt + RATE_WINDOW_MS - now) / 1000);

  res.setHeader('X-RateLimit-Limit', String(RATE_LIMIT_PER_MINUTE));
  res.setHeader('X-RateLimit-Remaining', String(remaining));
  res.setHeader('X-RateLimit-Reset', String(Math.max(1, resetSeconds)));

  if (bucket.count > RATE_LIMIT_PER_MINUTE) {
    res.setHeader('Retry-After', String(Math.max(1, resetSeconds)));
    return res.status(429).json({
      error: 'تعداد درخواست‌ها بیش از حد مجاز است. کمی بعد دوباره تلاش کنید.',
      code: 'RATE_LIMITED',
    });
  }

  next();
}

let activeRenders = 0;
const renderQueue = [];

class QueueFullError extends Error {
  constructor() {
    super('صف رندر پر است. چند لحظه دیگر دوباره تلاش کنید.');
    this.name = 'QueueFullError';
    this.statusCode = 503;
    this.code = 'RENDER_QUEUE_FULL';
  }
}

async function withRenderSlot(task) {
  if (activeRenders >= MAX_RENDER_CONCURRENCY) {
    if (renderQueue.length >= MAX_RENDER_QUEUE) throw new QueueFullError();
    await new Promise((resolve) => renderQueue.push(resolve));
  }

  activeRenders += 1;
  try {
    return await task();
  } finally {
    activeRenders -= 1;
    const next = renderQueue.shift();
    if (next) next();
  }
}

function boundedNumber(value, min, max) {
  if (value === undefined || value === null || value === '') return undefined;
  const number = Number(value);
  if (!Number.isFinite(number)) return undefined;
  return Math.min(max, Math.max(min, number));
}

function parseConfig(value) {
  if (!value) return undefined;
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch {
      // Normalized below as a client error.
    }
  }
  throw Object.assign(new Error('تنظیمات Mermaid باید یک شیء JSON معتبر باشد.'), {
    statusCode: 400,
    code: 'INVALID_CONFIG',
  });
}

function normalizeBackground(value) {
  if (!value) return undefined;
  const background = String(value).trim();
  if (background in BACKGROUNDS) return background;
  // The public API only needs the value produced by <input type="color">.
  // Restricting this field prevents CSS url() values and same-origin request tricks.
  if (/^#[0-9a-f]{3,4}(?:[0-9a-f]{3,4})?$/i.test(background)) return background;
  throw Object.assign(new Error('رنگ پس‌زمینه معتبر نیست.'), {
    statusCode: 400,
    code: 'INVALID_BACKGROUND',
  });
}

function pickRenderOptions(src = {}) {
  const theme = THEMES.includes(String(src.theme || '')) ? String(src.theme) : undefined;
  const layout = LAYOUTS.includes(String(src.layout || '')) ? String(src.layout) : undefined;
  const pdfPaper = PDF_PAPERS.includes(String(src.pdfPaper || '')) ? String(src.pdfPaper) : undefined;
  const background = normalizeBackground(src.background);

  return {
    theme,
    background,
    scale: boundedNumber(src.scale, 1, 5),
    quality: boundedNumber(src.quality, 1, 100),
    width: boundedNumber(src.width, 1, 5_000),
    height: boundedNumber(src.height, 1, 5_000),
    layout,
    css: src.css ? String(src.css) : undefined,
    config: parseConfig(src.config),
    pdfPaper,
    pdfLandscape: src.pdfLandscape === true || src.pdfLandscape === 'true',
    pdfFit: src.pdfFit === true || src.pdfFit === 'true',
  };
}

function validateRenderInput(code, options) {
  if (!code || !String(code).trim()) {
    throw Object.assign(new Error('کد نمودار وارد نشده است.'), { statusCode: 400, code: 'EMPTY_CODE' });
  }
  if (String(code).length > MAX_CODE_LENGTH) {
    throw Object.assign(new Error(`حداکثر طول کد ${MAX_CODE_LENGTH} نویسه است.`), { statusCode: 413, code: 'CODE_TOO_LARGE' });
  }
  if (options.css && options.css.length > MAX_CSS_LENGTH) {
    throw Object.assign(new Error(`حجم CSS از حد مجاز ${MAX_CSS_LENGTH} نویسه بیشتر است.`), { statusCode: 413, code: 'CSS_TOO_LARGE' });
  }
  if (options.config && JSON.stringify(options.config).length > MAX_CONFIG_LENGTH) {
    throw Object.assign(new Error('حجم تنظیمات Mermaid از حد مجاز بیشتر است.'), { statusCode: 413, code: 'CONFIG_TOO_LARGE' });
  }
}

function sendResult(res, result, format, download) {
  const bytes = Buffer.isBuffer(result.buffer) ? result.buffer : Buffer.from(result.buffer);
  res.setHeader('Content-Type', result.mime || mimeFor(format));
  res.setHeader('Content-Length', bytes.length);
  res.setHeader('Cache-Control', 'no-store');
  if (download) res.setHeader('Content-Disposition', `attachment; filename="diagram.${format}"`);
  res.end(bytes);
}

function sendApiError(res, error) {
  const status = Number(error?.statusCode) || (error?.name === 'MermaidParseError' ? 422 : 500);
  if (status >= 500 && process.env.NODE_ENV !== 'test') {
    console.error('[mermaid-studio]', error);
  }
  res.status(status).json({
    error: error?.message || 'خطای پیش‌بینی‌نشده در سرور.',
    name: error?.name || 'Error',
    code: error?.code,
  });
}

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);

  app.use(securityHeaders);
  app.use(express.json({ limit: '1mb', strict: true }));

  app.use('/vendor/mermaid', express.static(path.join(NM, 'mermaid', 'dist'), { setHeaders: vendorHeaders }));
  app.use('/vendor/codemirror', express.static(path.join(NM, 'codemirror'), { setHeaders: vendorHeaders }));
  app.use('/vendor/katex', express.static(path.join(NM, 'katex', 'dist'), { setHeaders: vendorHeaders }));
  app.use('/vendor/pako', express.static(path.join(NM, 'pako', 'dist'), { setHeaders: vendorHeaders }));
  app.use('/vendor/iconify', express.static(path.join(NM, '@iconify-json'), { setHeaders: vendorHeaders }));

  app.get(['/', '/index.html'], (_req, res) => renderPage(LANDING_HTML, res));
  app.get(['/editor', '/editor/'], (_req, res) => renderPage(EDITOR_HTML, res));
  app.get('/headless', (_req, res) => res.sendFile(HEADLESS_HTML));

  app.use('/vendor-build', express.static(path.join(PUBLIC_DIR, 'vendor-build'), { setHeaders: vendorHeaders }));
  app.use(express.static(PUBLIC_DIR, { setHeaders: appHeaders, index: false }));

  app.get('/api/health', (_req, res) => res.json({
    ok: true,
    version: pkg.version,
    activeRenders,
    queuedRenders: renderQueue.length,
  }));
  app.get('/api/version', (_req, res) => res.json({ name: pkg.name, version: pkg.version }));

  const meta = () => ({
    version: pkg.version,
    examples: EXAMPLES,
    themes: THEMES,
    formats: FORMATS,
    papers: PDF_PAPERS,
    layouts: LAYOUTS,
    backgrounds: Object.keys(BACKGROUNDS),
    iconPacks: ICON_PACKS,
    diagramTypes: DIAGRAM_TYPES,
    defaults: DEFAULTS,
    publicMode: PUBLIC_MODE,
    allowUnsafeMermaid: ALLOW_UNSAFE_MERMAID,
    sponsor: SPONSOR,
    limits: {
      maxCodeLength: MAX_CODE_LENGTH,
      maxCssLength: MAX_CSS_LENGTH,
      maxConfigLength: MAX_CONFIG_LENGTH,
      rendersPerMinute: RATE_LIMIT_PER_MINUTE,
    },
  });
  app.get('/api/meta', (_req, res) => res.json(meta()));
  app.get('/api/examples', (_req, res) => res.json(meta()));

  const selfUrl = (req) => `http://127.0.0.1:${req.socket.localPort}`;

  app.use('/api/render', renderRateLimit);

  app.post('/api/render', async (req, res) => {
    try {
      const { code, format = 'svg', download } = req.body || {};
      const normalizedFormat = String(format).toLowerCase();
      if (!FORMATS.includes(normalizedFormat)) {
        throw Object.assign(new Error(`فرمت «${normalizedFormat}» پشتیبانی نمی‌شود.`), { statusCode: 400, code: 'UNKNOWN_FORMAT' });
      }
      const options = pickRenderOptions(req.body || {});
      validateRenderInput(code, options);
      const result = await withRenderSlot(() => renderDiagram({
        serverUrl: selfUrl(req),
        code: String(code),
        format: normalizedFormat,
        ...options,
      }));
      sendResult(res, result, normalizedFormat, download);
    } catch (error) {
      sendApiError(res, error);
    }
  });

  app.get('/api/render', async (req, res) => {
    try {
      let code = req.query.code || '';
      if (req.query.encoding === 'base64' && code) {
        try {
          code = Buffer.from(String(code), 'base64').toString('utf8');
        } catch {
          throw Object.assign(new Error('کد Base64 معتبر نیست.'), { statusCode: 400, code: 'INVALID_BASE64' });
        }
      }

      const format = String(req.query.format || 'svg').toLowerCase();
      if (!FORMATS.includes(format)) {
        throw Object.assign(new Error(`فرمت «${format}» پشتیبانی نمی‌شود.`), { statusCode: 400, code: 'UNKNOWN_FORMAT' });
      }
      const options = pickRenderOptions(req.query || {});
      validateRenderInput(code, options);
      const result = await withRenderSlot(() => renderDiagram({
        serverUrl: selfUrl(req),
        code: String(code),
        format,
        ...options,
      }));
      sendResult(res, result, format, req.query.download);
    } catch (error) {
      sendApiError(res, error);
    }
  });

  app.use((error, _req, res, _next) => {
    if (error?.type === 'entity.too.large') {
      return res.status(413).json({ error: 'حجم درخواست بیش از حد مجاز است.', code: 'BODY_TOO_LARGE' });
    }
    if (error instanceof SyntaxError && 'body' in error) {
      return res.status(400).json({ error: 'بدنهٔ JSON معتبر نیست.', code: 'INVALID_JSON' });
    }
    sendApiError(res, error);
  });

  return app;
}

export function startServer({ port = 0, host = '127.0.0.1' } = {}) {
  const app = createApp();
  return new Promise((resolve, reject) => {
    const server = app.listen(port, host, () => {
      const addr = server.address();
      const actualPort = typeof addr === 'object' && addr ? addr.port : port;
      const displayHost = host === '0.0.0.0' ? 'localhost' : host;
      resolve({
        server,
        port: actualPort,
        url: `http://${displayHost}:${actualPort}`,
        close: () => new Promise((res) => server.close(() => res())),
      });
    });
    server.on('error', reject);
  });
}
