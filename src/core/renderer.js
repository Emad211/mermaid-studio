/**
 * Headless Chromium rendering core shared by the CLI and HTTP API.
 * External network requests are blocked, each render is time-bounded, and
 * output dimensions are capped before raster/PDF work begins.
 */

import puppeteer from 'puppeteer';
import { resolveBackground } from '../shared/config.js';

let browserPromise = null;

const PAPER_SIZES = {
  a3: [1123, 1587],
  a4: [794, 1123],
  a5: [559, 794],
  letter: [816, 1056],
  legal: [816, 1344],
  tabloid: [1056, 1632],
};

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_SIDE = 12_000;
const MAX_OUTPUT_PIXELS = 60_000_000;

function clamp(number, min, max) {
  const value = Number(number);
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function normalizeFormat(format) {
  const value = String(format || 'svg').toLowerCase();
  return value === 'jpg' ? 'jpeg' : value;
}

function environmentBoolean(name, fallback = false) {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function browserArgs() {
  const args = [
    '--disable-dev-shm-usage',
    '--font-render-hinting=none',
    '--disable-background-networking',
    '--disable-default-apps',
    '--disable-extensions',
    '--disable-sync',
    '--metrics-recording-only',
    '--no-first-run',
  ];

  // Chromium generally requires this when the container runs as root. Prefer a
  // non-root container so the browser sandbox remains enabled.
  const runningAsRoot = typeof process.getuid === 'function' && process.getuid() === 0;
  if (environmentBoolean('PUPPETEER_NO_SANDBOX', runningAsRoot)) {
    args.push('--no-sandbox', '--disable-setuid-sandbox');
  }
  return args;
}

export async function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer
      .launch({
        headless: true,
        args: browserArgs(),
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      })
      .catch((error) => {
        browserPromise = null;
        throw new ChromeUnavailableError(error);
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
    // Best-effort shutdown.
  } finally {
    browserPromise = null;
  }
}

export class ChromeUnavailableError extends Error {
  constructor(cause) {
    super(
      'Could not launch headless Chromium for rendering.\n' +
        '  • Install it with: npx puppeteer browsers install chrome\n' +
        '  • Or set PUPPETEER_EXECUTABLE_PATH to an existing Chrome/Chromium binary.\n' +
        `  Original error: ${cause?.message || cause}`
    );
    this.name = 'ChromeUnavailableError';
    this.cause = cause;
  }
}

export class RenderTimeoutError extends Error {
  constructor(timeoutMs) {
    super(`Rendering exceeded the ${timeoutMs} ms time limit.`);
    this.name = 'RenderTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

export class RenderSizeError extends Error {
  constructor(width, height) {
    super(`Rendered diagram is too large (${Math.round(width)} × ${Math.round(height)} px).`);
    this.name = 'RenderSizeError';
    this.width = width;
    this.height = height;
  }
}

async function withTimeout(promise, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new RenderTimeoutError(timeoutMs)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function hardenPage(page, serverUrl, timeoutMs) {
  const allowedOrigin = new URL(serverUrl).origin;
  page.setDefaultTimeout(timeoutMs);
  page.setDefaultNavigationTimeout(timeoutMs);
  await page.setRequestInterception(true);

  page.on('request', (request) => {
    const target = request.url();
    try {
      if (target.startsWith('data:') || target.startsWith('blob:')) {
        request.continue();
        return;
      }
      if (new URL(target).origin === allowedOrigin) {
        request.continue();
        return;
      }
    } catch {
      // Invalid URLs are blocked below.
    }
    request.abort('blockedbyclient');
  });

  page.on('dialog', (dialog) => void dialog.dismiss());
}

function assertOutputSize(width, height, scale = 1) {
  const scaledWidth = Number(width) * Number(scale || 1);
  const scaledHeight = Number(height) * Number(scale || 1);
  if (
    !Number.isFinite(scaledWidth) ||
    !Number.isFinite(scaledHeight) ||
    scaledWidth <= 0 ||
    scaledHeight <= 0 ||
    scaledWidth > MAX_OUTPUT_SIDE ||
    scaledHeight > MAX_OUTPUT_SIDE ||
    scaledWidth * scaledHeight > MAX_OUTPUT_PIXELS
  ) {
    throw new RenderSizeError(scaledWidth, scaledHeight);
  }
}

export async function validateDiagram({ serverUrl, code, theme = 'default', timeoutMs = DEFAULT_TIMEOUT_MS }) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  const safeTimeout = clamp(timeoutMs, 1_000, 60_000);
  try {
    await hardenPage(page, serverUrl, safeTimeout);
    await page.goto(`${serverUrl}/headless`, { waitUntil: 'load', timeout: safeTimeout });
    await page.waitForFunction('window.__mermaidReady === true', { timeout: safeTimeout });
    return await withTimeout(
      page.evaluate((args) => window.__validate(args), { code, theme }),
      safeTimeout
    );
  } finally {
    await page.close().catch(() => {});
  }
}

export async function renderDiagram(options) {
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
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = options;

  const format = normalizeFormat(options.format);
  const safeTimeout = clamp(timeoutMs, 1_000, 60_000);
  const deviceScale = clamp(scale, 1, 5);
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await hardenPage(page, serverUrl, safeTimeout);
    const resolvedBackground = resolveBackground(background);

    let renderWidth = Number(width) || null;
    const renderHeight = Number(height) || null;
    if (format === 'pdf' && pdfPaper !== 'auto' && pdfFit) {
      const paper = PAPER_SIZES[pdfPaper] || PAPER_SIZES.a4;
      renderWidth = (pdfLandscape ? paper[1] : paper[0]) - 48;
    }

    await page.setViewport({
      width: Math.round(clamp(Number(width) || 1400, 1, 5_000)),
      height: Math.round(clamp(Number(height) || 900, 1, 5_000)),
      deviceScaleFactor: deviceScale,
    });

    await page.goto(`${serverUrl}/headless`, { waitUntil: 'load', timeout: safeTimeout });
    await page.waitForFunction('window.__mermaidReady === true', { timeout: safeTimeout });

    const effectiveBackground =
      format === 'jpeg' && resolvedBackground === 'transparent' ? '#ffffff' : resolvedBackground;

    const result = await withTimeout(
      page.evaluate(
        (args) => window.__render(args),
        {
          code,
          theme,
          background: effectiveBackground,
          width: renderWidth,
          height: renderHeight,
          config,
          layout,
          css,
        }
      ),
      safeTimeout
    );

    if (result?.error) {
      const error = new Error(result.error);
      error.name = 'MermaidParseError';
      throw error;
    }

    assertOutputSize(result.width, result.height, format === 'svg' || format === 'pdf' ? 1 : deviceScale);
    const meta = { width: result.width, height: result.height, svg: result.svg };

    if (format === 'svg') {
      return {
        ...meta,
        buffer: Buffer.from(result.svg, 'utf8'),
        mime: 'image/svg+xml',
      };
    }

    if (format === 'png' || format === 'jpeg' || format === 'webp') {
      const handle = await page.evaluateHandle(
        () => document.querySelector('#container')?.shadowRoot?.querySelector('svg') || null
      );
      const element = handle.asElement();
      if (!element) {
        await handle.dispose();
        throw new Error('Rendered SVG element was not found.');
      }
      const screenshotOptions = { type: format };
      if (format === 'jpeg' || format === 'webp') {
        screenshotOptions.quality = Math.round(clamp(quality, 1, 100));
      }
      if (format !== 'jpeg') screenshotOptions.omitBackground = effectiveBackground === 'transparent';
      try {
        const screenshot = await withTimeout(element.screenshot(screenshotOptions), safeTimeout);
        const mime = format === 'jpeg' ? 'image/jpeg' : `image/${format}`;
        return { ...meta, buffer: Buffer.from(screenshot), mime };
      } finally {
        await handle.dispose().catch(() => {});
      }
    }

    if (format === 'pdf') {
      const printBackground = effectiveBackground !== 'transparent';
      let documentBytes;
      if (pdfPaper === 'auto') {
        const pageWidth = Math.max(1, Math.ceil(result.width));
        const pageHeight = Math.max(1, Math.ceil(result.height));
        documentBytes = await withTimeout(
          page.pdf({
            width: `${pageWidth + 2}px`,
            height: `${pageHeight + 2}px`,
            printBackground,
            pageRanges: '1',
            margin: { top: 0, right: 0, bottom: 0, left: 0 },
          }),
          safeTimeout
        );
      } else {
        documentBytes = await withTimeout(
          page.pdf({
            format: pdfPaper,
            landscape: pdfLandscape,
            printBackground,
            ...(pdfFit ? { pageRanges: '1' } : {}),
            margin: { top: '0.25in', right: '0.25in', bottom: '0.25in', left: '0.25in' },
          }),
          safeTimeout
        );
      }
      return { ...meta, buffer: Buffer.from(documentBytes), mime: 'application/pdf' };
    }

    throw new Error(`Unsupported format: ${format}`);
  } finally {
    await page.close().catch(() => {});
  }
}
