/**
 * Headless rendering core.
 *
 * Both the CLI and the GUI server render diagrams the *same* way: they point a
 * headless Chromium page at the local `/headless` route, ask the page to run
 * Mermaid (the exact same ESM build the browser GUI uses), then extract the
 * result as SVG, a raster image (PNG/JPEG/WebP, via element screenshot) or PDF
 * (via page.pdf). This guarantees the CLI output matches the live preview.
 */

import puppeteer from 'puppeteer';
import { resolveBackground } from '../shared/config.js';

let browserPromise = null;

/** Paper sizes in CSS px @96dpi (portrait width × height). */
const PAPER_SIZES = {
  a3: [1123, 1587],
  a4: [794, 1123],
  a5: [559, 794],
  letter: [816, 1056],
  legal: [816, 1344],
  tabloid: [1056, 1632],
};

function clamp(n, min, max) {
  n = Number(n);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function normalizeFormat(fmt) {
  fmt = String(fmt || 'svg').toLowerCase();
  return fmt === 'jpg' ? 'jpeg' : fmt;
}

/** Lazily launch (and reuse) a single headless browser for the process. */
export async function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer
      .launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--font-render-hinting=none',
        ],
      })
      .catch((err) => {
        browserPromise = null;
        throw new ChromeUnavailableError(err);
      });
  }
  return browserPromise;
}

export async function closeBrowser() {
  if (!browserPromise) return;
  try {
    const browser = await browserPromise;
    await browser.close();
  } catch {
    /* ignore */
  } finally {
    browserPromise = null;
  }
}

export class ChromeUnavailableError extends Error {
  constructor(cause) {
    super(
      'Could not launch headless Chromium for rendering.\n' +
        '  • PNG/JPEG/WebP/PDF/SVG export needs the Chrome that Puppeteer downloads on install.\n' +
        '  • Try:  npx puppeteer browsers install chrome\n' +
        '  • Or point PUPPETEER_EXECUTABLE_PATH at an existing Chrome/Edge binary.\n' +
        `  Original error: ${cause?.message || cause}`
    );
    this.name = 'ChromeUnavailableError';
    this.cause = cause;
  }
}

/**
 * Validate Mermaid source without producing output. Returns {valid, message?, line?}.
 */
export async function validateDiagram({ serverUrl, code, theme = 'default' }) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.goto(`${serverUrl}/headless`, { waitUntil: 'load' });
    await page.waitForFunction('window.__mermaidReady === true', { timeout: 30000 });
    return await page.evaluate((args) => window.__validate(args), { code, theme });
  } finally {
    await page.close().catch(() => {});
  }
}

/**
 * Render a single diagram against a running server.
 *
 * @param {object} opts
 * @param {string} opts.serverUrl
 * @param {string} opts.code
 * @param {('svg'|'png'|'jpeg'|'jpg'|'webp'|'pdf')} [opts.format]
 * @param {string} [opts.theme]
 * @param {string} [opts.background]   preset name or CSS color
 * @param {number} [opts.scale]        device pixel ratio for raster (1–5)
 * @param {number} [opts.quality]      JPEG/WebP quality 1–100
 * @param {number} [opts.width]        explicit SVG width in px (vector resize)
 * @param {number} [opts.height]
 * @param {object} [opts.config]       full mermaid config (themeVariables, …)
 * @param {string} [opts.layout]       'elk' | 'dagre'
 * @param {string} [opts.css]          custom CSS injected into the SVG
 * @param {string} [opts.pdfPaper]     'auto' | 'a4' | 'letter' | …
 * @param {boolean}[opts.pdfLandscape]
 * @param {boolean}[opts.pdfFit]       scale the diagram to fit one page width
 * @returns {Promise<{buffer: Buffer, mime: string, width: number, height: number, svg?: string}>}
 */
export async function renderDiagram(opts) {
  const {
    serverUrl,
    code,
    theme = 'default',
    background = 'white',
    scale = 2,
    quality = 92,
    width,
    height,
    config,
    layout,
    css,
    pdfPaper = 'auto',
    pdfLandscape = false,
    pdfFit = false,
  } = opts;
  const format = normalizeFormat(opts.format);

  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    const bg = resolveBackground(background);

    // Decide the SVG render width up-front (PDF fit needs the printable width).
    let renderWidth = Number(width) || null;
    const renderHeight = Number(height) || null;
    if (format === 'pdf' && pdfPaper !== 'auto' && pdfFit) {
      const size = PAPER_SIZES[pdfPaper] || PAPER_SIZES.a4;
      const printableW = (pdfLandscape ? size[1] : size[0]) - 48; // ~0.25in margins
      renderWidth = printableW;
    }

    await page.setViewport({
      width: Math.round(Number(width) || 1400),
      height: Math.round(Number(height) || 900),
      deviceScaleFactor: clamp(scale, 1, 5),
    });

    await page.goto(`${serverUrl}/headless`, { waitUntil: 'load' });
    await page.waitForFunction('window.__mermaidReady === true', { timeout: 30000 });

    // JPEG can't be transparent — render on a solid backdrop.
    const effectiveBg = format === 'jpeg' && bg === 'transparent' ? '#ffffff' : bg;

    const result = await page.evaluate(
      (args) => window.__render(args),
      { code, theme, background: effectiveBg, width: renderWidth, height: renderHeight, config, layout, css }
    );

    if (result?.error) {
      const err = new Error(result.error);
      err.name = 'MermaidParseError';
      throw err;
    }

    const meta = { width: result.width, height: result.height, svg: result.svg };

    if (format === 'svg') {
      return { ...meta, buffer: Buffer.from(result.svg, 'utf8'), mime: 'image/svg+xml' };
    }

    if (format === 'png' || format === 'jpeg' || format === 'webp') {
      const el = await page.$('#container > svg');
      const shotOpts = { type: format };
      if (format === 'jpeg' || format === 'webp') shotOpts.quality = clamp(quality, 1, 100);
      if (format !== 'jpeg') shotOpts.omitBackground = effectiveBg === 'transparent';
      // Puppeteer returns a Uint8Array; normalise to a Node Buffer for HTTP.
      const shot = await el.screenshot(shotOpts);
      const mime = format === 'jpeg' ? 'image/jpeg' : `image/${format}`;
      return { ...meta, buffer: Buffer.from(shot), mime };
    }

    if (format === 'pdf') {
      const printBackground = effectiveBg !== 'transparent';
      let doc;
      if (pdfPaper === 'auto') {
        const w = Math.max(1, Math.ceil(result.width));
        const h = Math.max(1, Math.ceil(result.height));
        doc = await page.pdf({
          width: `${w + 2}px`,
          height: `${h + 2}px`,
          printBackground,
          pageRanges: '1',
          margin: { top: 0, right: 0, bottom: 0, left: 0 },
        });
      } else {
        doc = await page.pdf({
          format: pdfPaper,
          landscape: pdfLandscape,
          printBackground,
          ...(pdfFit ? { pageRanges: '1' } : {}),
          margin: { top: '0.25in', right: '0.25in', bottom: '0.25in', left: '0.25in' },
        });
      }
      return { ...meta, buffer: Buffer.from(doc), mime: 'application/pdf' };
    }

    throw new Error(`Unsupported format: ${format}`);
  } finally {
    await page.close().catch(() => {});
  }
}
