/**
 * Express application for the hosted/local Mermaid Studio product.
 *
 * Routes:
 *   /             Persian product landing page
 *   /editor       bilingual editor
 *   /templates    searchable Persian template gallery
 *   /headless     isolated page used by Puppeteer
 *   /api/render   bounded render API
 *   /api/meta     editor metadata and optional sponsor configuration
 */

import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';
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
import { advertisingConfig, advertisingCspSources } from './ads.js';

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
const HEADLESS_HTML = path.join(PUBLIC_DIR, 'headless.html');
const PRIVACY_HTML = path.join(PUBLIC_DIR, 'privacy.html');
const TERMS_HTML = path.join(PUBLIC_DIR, 'terms.html');

const ICON_PACKS = ['logos', 'mdi', 'fa6-solid', 'fa6-brands'];
const DIAGRAM_TYPES = [
  'flowchart',
  'sequence',
  'class',
  'state',
  'entity-relationship',
  'user journey',
  'gantt',
  'pie',
  'quadrant',
  'requirement',
  'gitgraph',
  'C4',
  'mindmap',
  'timeline',
  'sankey',
  'xychart',
  'block',
  'packet',
  'kanban',
  'architecture',
  'radar',
  'zenuml',
];

const FORMAT_SET = new Set(FORMATS);
const THEME_SET = new Set(THEMES);
const LAYOUT_SET = new Set(LAYOUTS);
const PAPER_SET = new Set(PDF_PAPERS);
const BACKGROUND_SET = new Set(Object.keys(BACKGROUNDS));

function envBoolean(name, fallback = false) {
  const value = process.env[name];
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
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

function appAssetHeaders(res, filePath) {
  javascriptType(res, filePath);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

function inlineScriptHashes(html) {
  const hashes = [];
  const pattern = /<script\b(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = pattern.exec(html))) {
    const body = match[1];
    if (!body.trim()) continue;
    hashes.push(`'sha256-${crypto.createHash('sha256').update(body).digest('base64')}'`);
  }
  return hashes;
}

function sendHtml(res, filePath) {
  const html = fs.readFileSync(filePath, 'utf8').split('%V%').join(BUILD);
  const hashes = inlineScriptHashes(html);
  if (hashes.length) {
    res.setHeader('Content-Security-Policy', contentSecurityPolicy(res.req, hashes));
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.send(html);
}

const ADVERTISING_PATHS = new Set([
  '/',
  '/fa',
  '/fa/',
  '/templates',
  '/templates/',
  '/examples',
  '/examples/',
  '/learn',
  '/learn/',
]);

function contentSecurityPolicy(req, inlineHashes = []) {
  // Publisher scripts are admitted only on content pages. The editor and
  // headless renderer retain a first-party-only policy, so ad code cannot read
  // Mermaid source, localStorage state or rendered diagrams.
  const adSources = ADVERTISING_PATHS.has(req.path) ? advertisingCspSources() : [];
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

function securityHeaders(req, res, next) {
  res.setHeader('Content-Security-Policy', contentSecurityPolicy(req));
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader(
    'Permissions-Policy',
    'accelerometer=(), camera=(), geolocation=(), gyroscope=(), microphone=(), payment=(), usb=()'
  );
  if (req.secure || envBoolean('FORCE_HSTS')) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
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
  if (download) {
    res.setHeader('Content-Disposition', `attachment; filename="diagram.${normalizedFormat}"`);
  }
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
  if (error instanceof HttpError) return error;
  if (error?.type === 'entity.too.large') {
    return new HttpError(413, 'REQUEST_TOO_LARGE', 'The request body is too large.');
  }
  if (error instanceof SyntaxError && Object.prototype.hasOwnProperty.call(error, 'body')) {
    return new HttpError(400, 'INVALID_JSON', 'The request body must be valid JSON.');
  }
  if (error?.name === 'MermaidParseError') {
    return new HttpError(422, 'MERMAID_PARSE_ERROR', error.message || 'The Mermaid diagram is invalid.');
  }
  if (error?.name === 'ChromeUnavailableError') {
    return new HttpError(503, 'RENDERER_UNAVAILABLE', 'The server-side renderer is unavailable.');
  }
  if (error?.name === 'RenderTimeoutError') {
    return new HttpError(504, 'RENDER_TIMEOUT', 'The render operation exceeded its time limit.');
  }
  if (error?.name === 'RenderSizeError') {
    return new HttpError(413, 'OUTPUT_TOO_LARGE', error.message || 'The rendered diagram is too large.');
  }
  return new HttpError(500, 'INTERNAL_ERROR', 'The render request could not be completed.');
}

export function createApp() {
  const app = express();
  app.disable('x-powered-by');

  if (envBoolean('TRUST_PROXY')) app.set('trust proxy', 1);
  app.use(securityHeaders);
  app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '256kb', strict: true }));

  const renderRateLimit = createRateLimiter({
    windowMs: positiveInteger(process.env.RENDER_RATE_WINDOW_MS, 60_000, 1_000, 3_600_000),
    max: positiveInteger(process.env.RENDER_RATE_MAX, 30, 1, 10_000),
  });
  const renderGate = createRenderGate({
    concurrency: positiveInteger(process.env.RENDER_CONCURRENCY, 2, 1, 16),
    maxQueue: positiveInteger(process.env.RENDER_QUEUE_MAX, 20, 0, 1_000),
  });

  // Locally vendored dependencies: no CDN is required for the editor.
  app.use('/vendor/mermaid', express.static(path.join(NODE_MODULES, 'mermaid', 'dist'), { setHeaders: vendorHeaders }));
  app.use('/vendor/codemirror', express.static(path.join(NODE_MODULES, 'codemirror'), { setHeaders: vendorHeaders }));
  app.use('/vendor/katex', express.static(path.join(NODE_MODULES, 'katex', 'dist'), { setHeaders: vendorHeaders }));
  app.use('/vendor/pako', express.static(path.join(NODE_MODULES, 'pako', 'dist'), { setHeaders: vendorHeaders }));
  app.use('/vendor/iconify', express.static(path.join(NODE_MODULES, '@iconify-json'), { setHeaders: vendorHeaders }));
  app.use('/vendor-build', express.static(path.join(PUBLIC_DIR, 'vendor-build'), { setHeaders: vendorHeaders }));

  // Product pages are served explicitly so HTML always receives the build token.
  app.get(['/', '/fa', '/fa/'], (_req, res) => sendHtml(res, LANDING_HTML));
  app.get(['/editor', '/editor/', '/index.html'], (_req, res) => sendHtml(res, EDITOR_HTML));
  app.get(['/templates', '/templates/', '/examples', '/examples/'], (_req, res) => sendHtml(res, TEMPLATES_HTML));
  app.get(['/learn', '/learn/'], (_req, res) => sendHtml(res, LEARN_HTML));
  app.get('/headless', (_req, res) => sendHtml(res, HEADLESS_HTML));
  app.get(['/privacy', '/privacy/'], (_req, res) => sendHtml(res, PRIVACY_HTML));
  app.get(['/terms', '/terms/'], (_req, res) => sendHtml(res, TERMS_HTML));

  app.use(express.static(PUBLIC_DIR, { setHeaders: appAssetHeaders, index: false }));

  const metadata = () => ({
    version: pkg.version,
    businessModel: 'advertising',
    product: {
      defaultLanguage: 'fa',
      languages: ['fa', 'en'],
      safeMode: true,
      localPreview: true,
    },
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
    res.json({ ok: true, version: pkg.version, render: renderGate.stats() });
  });
  app.get('/api/version', (_req, res) => res.json({ name: pkg.name, version: pkg.version }));
  app.get('/api/meta', (_req, res) => res.json(metadata()));
  app.get('/api/examples', (_req, res) => res.json(metadata()));
  app.get('/api/ads', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(advertisingConfig());
  });

  const normalize = (source) =>
    normalizeRenderRequest(source, {
      formats: FORMAT_SET,
      themes: THEME_SET,
      layouts: LAYOUT_SET,
      papers: PAPER_SET,
      backgrounds: BACKGROUND_SET,
    });

  app.post('/api/render', renderRateLimit, async (req, res, next) => {
    try {
      const options = normalize(req.body);
      const result = await renderGate.run(() =>
        renderDiagram({ serverUrl: internalServerUrl(req), ...options })
      );
      sendRenderResult(res, result, options.format, options.download);
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/render', renderRateLimit, async (req, res, next) => {
    try {
      const options = normalize({ ...req.query, code: decodeQueryCode(req.query) });
      const result = await renderGate.run(() =>
        renderDiagram({ serverUrl: internalServerUrl(req), ...options })
      );
      sendRenderResult(res, result, options.format, options.download);
    } catch (error) {
      next(error);
    }
  });

  app.use('/api', (_req, _res, next) => {
    next(new HttpError(404, 'API_NOT_FOUND', 'API route not found.'));
  });

  app.use((error, _req, res, _next) => {
    const safe = publicError(error);
    if (safe.status >= 500) {
      console.error(`[${safe.code}]`, error?.message || error);
    }
    if (res.headersSent) return;
    res.status(safe.status).json({ error: safe.message, code: safe.code });
  });

  return app;
}

export function startServer({ port = 0, host = '127.0.0.1' } = {}) {
  const app = createApp();
  return new Promise((resolve, reject) => {
    const server = app.listen(port, host, () => {
      const address = server.address();
      const actualPort = typeof address === 'object' && address ? address.port : port;
      const displayHost = host === '0.0.0.0' ? 'localhost' : host;
      resolve({
        server,
        port: actualPort,
        url: `http://${displayHost}:${actualPort}`,
        close: () => new Promise((done) => server.close(done)),
      });
    });
    server.on('error', reject);
  });
}
