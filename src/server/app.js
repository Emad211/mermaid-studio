/**
 * The local Express server. It powers both the GUI and the headless renderer:
 *
 *   /                → the Mermaid Studio editor (live preview, export)
 *   /headless        → a minimal page Puppeteer drives for CLI/PDF rendering
 *   /vendor/*        → mermaid, codemirror, katex, pako, iconify served locally
 *   /vendor-build/*  → pre-bundled browser modules (ELK) — served from /public
 *   /api/render      → POST: render to any format; GET: render for <img> embeds
 *   /api/meta        → themes, formats, papers, layouts, examples, icon packs
 *   /api/version     → name + version
 *   /api/health      → liveness probe
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

// A fresh token per server start. Appended to every app asset URL so the
// browser can never serve a stale GUI from an old HTTP cache entry.
const BUILD = `${pkg.version}.${Date.now().toString(36)}`;
const INDEX_HTML = path.join(PUBLIC_DIR, 'index.html');

/** Serve index.html with cache-busting version tokens injected. */
function renderIndex(res) {
  let html = fs.readFileSync(INDEX_HTML, 'utf8');
  html = html.split('%V%').join(BUILD);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.send(html);
}

const ICON_PACKS = ['logos', 'mdi', 'fa6-solid', 'fa6-brands'];
const DIAGRAM_TYPES = [
  'flowchart', 'sequence', 'class', 'state', 'entity-relationship', 'user journey',
  'gantt', 'pie', 'quadrant', 'requirement', 'gitgraph', 'C4', 'mindmap', 'timeline',
  'sankey', 'xychart', 'block', 'packet', 'kanban', 'architecture', 'radar', 'zenuml',
];

function jsType(res, filePath) {
  if (filePath.endsWith('.mjs') || filePath.endsWith('.js')) {
    res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
  }
}
/** Vendored libraries are immutable → cache hard. */
function vendorHeaders(res, filePath) {
  jsType(res, filePath);
  res.setHeader('Cache-Control', 'public, max-age=86400');
}
/** The app's own HTML/JS/CSS must never go stale during development. */
function appHeaders(res, filePath) {
  jsType(res, filePath);
  res.setHeader('Cache-Control', 'no-store');
}

/** Pull render options out of a plain object (POST body or parsed GET query). */
function pickRenderOptions(src) {
  const opts = {
    theme: src.theme,
    background: src.background,
    scale: src.scale,
    quality: src.quality,
    width: src.width,
    height: src.height,
    layout: src.layout,
    css: src.css,
    pdfPaper: src.pdfPaper,
    pdfLandscape: src.pdfLandscape === true || src.pdfLandscape === 'true',
    pdfFit: src.pdfFit === true || src.pdfFit === 'true',
  };
  // config may arrive as an object (POST) or a JSON string (GET).
  if (src.config) {
    opts.config = typeof src.config === 'string' ? JSON.parse(src.config) : src.config;
  }
  return opts;
}

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '8mb' }));

  // Vendored libraries (offline, no CDN).
  app.use('/vendor/mermaid', express.static(path.join(NM, 'mermaid', 'dist'), { setHeaders: vendorHeaders }));
  app.use('/vendor/codemirror', express.static(path.join(NM, 'codemirror'), { setHeaders: vendorHeaders }));
  app.use('/vendor/katex', express.static(path.join(NM, 'katex', 'dist'), { setHeaders: vendorHeaders }));
  app.use('/vendor/pako', express.static(path.join(NM, 'pako', 'dist'), { setHeaders: vendorHeaders }));
  app.use('/vendor/iconify', express.static(path.join(NM, '@iconify-json'), { setHeaders: vendorHeaders }));

  // index.html is templated with cache-busting tokens — serve it explicitly
  // (before static) so it is never cached stale.
  app.get(['/', '/index.html'], (_req, res) => renderIndex(res));

  // Front-end assets (css/js) + /vendor-build (ELK bundle).
  // The ELK bundle is immutable but lives under /public; serve it cached first.
  app.use('/vendor-build', express.static(path.join(PUBLIC_DIR, 'vendor-build'), { setHeaders: vendorHeaders }));
  app.use(express.static(PUBLIC_DIR, { setHeaders: appHeaders, index: false }));

  app.get('/headless', (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'headless.html')));

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
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
  });
  app.get('/api/meta', (_req, res) => res.json(meta()));
  app.get('/api/examples', (_req, res) => res.json(meta())); // back-compat alias

  const selfUrl = (req) => `http://127.0.0.1:${req.socket.localPort}`;

  function sendResult(res, result, format, download) {
    const bytes = Buffer.isBuffer(result.buffer) ? result.buffer : Buffer.from(result.buffer);
    res.setHeader('Content-Type', result.mime || mimeFor(format));
    res.setHeader('Content-Length', bytes.length);
    if (download) res.setHeader('Content-Disposition', `attachment; filename="diagram.${format}"`);
    res.end(bytes);
  }

  // POST render — the GUI's primary export path.
  app.post('/api/render', async (req, res) => {
    const { code, format = 'svg', download } = req.body || {};
    if (!code || !String(code).trim()) return res.status(400).json({ error: 'No diagram code provided.' });
    if (!FORMATS.includes(String(format).toLowerCase())) {
      return res.status(400).json({ error: `Unknown format "${format}".` });
    }
    try {
      const result = await renderDiagram({ serverUrl: selfUrl(req), code, format, ...pickRenderOptions(req.body) });
      sendResult(res, result, format, download);
    } catch (err) {
      res.status(422).json({ error: err.message, name: err.name });
    }
  });

  // GET render — for embedding, e.g. <img src="/api/render?format=svg&code=...">.
  // `code` may be raw (urlencoded) or base64 when `encoding=base64`.
  app.get('/api/render', async (req, res) => {
    try {
      let code = req.query.code || '';
      if (req.query.encoding === 'base64' && code) {
        code = Buffer.from(String(code), 'base64').toString('utf8');
      }
      if (!code.trim()) return res.status(400).json({ error: 'No diagram code provided.' });
      if (code.length > 200000) return res.status(413).json({ error: 'Diagram too large.' });
      const format = String(req.query.format || 'svg').toLowerCase();
      if (!FORMATS.includes(format)) return res.status(400).json({ error: `Unknown format "${format}".` });
      const result = await renderDiagram({ serverUrl: selfUrl(req), code, format, ...pickRenderOptions(req.query) });
      res.setHeader('Cache-Control', 'no-store');
      sendResult(res, result, format, req.query.download);
    } catch (err) {
      res.status(422).json({ error: err.message, name: err.name });
    }
  });

  return app;
}

/**
 * Start the server.
 * @returns {Promise<{server, url, port, close}>}
 */
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
