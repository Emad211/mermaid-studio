/** Security and resource guards for the public Mermaid rendering API. */

const DEFAULT_LIMITS = Object.freeze({
  codeChars: 100_000,
  cssChars: 30_000,
  configChars: 40_000,
  width: 5_000,
  height: 5_000,
  scale: 5,
  renderTimeoutMs: 20_000,
});

export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max, fallback = min) {
  return Math.min(max, Math.max(min, finiteNumber(value, fallback)));
}

function booleanValue(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  return String(value).toLowerCase() === 'true' || String(value) === '1';
}

function safeBackground(value, allowedPresets) {
  const background = String(value || 'white').trim();
  if (allowedPresets.has(background)) return background;
  if (background.length > 64) throw new HttpError(400, 'INVALID_BACKGROUND', 'Background value is too long.');
  if (/^(?:#[0-9a-f]{3,8}|rgba?\([\d\s.,%+-]+\)|hsla?\([\d\s.,%+-]+\)|[a-z]{1,24})$/i.test(background)) {
    return background;
  }
  throw new HttpError(400, 'INVALID_BACKGROUND', 'Background must be a safe CSS color.');
}

function safeCss(value, maxChars) {
  const css = value === undefined || value === null ? '' : String(value);
  if (css.length > maxChars) throw new HttpError(413, 'CSS_TOO_LARGE', 'Custom CSS is too large.');
  if (/<\/?(?:script|iframe|object|embed)\b|<\/style\b|@import\b|expression\s*\(|javascript\s*:|vbscript\s*:|behavior\s*:/i.test(css)) {
    throw new HttpError(400, 'INVALID_CSS', 'Custom CSS contains a blocked construct.');
  }

  const urlPattern = /url\(\s*(['"]?)(.*?)\1\s*\)/gi;
  let match;
  while ((match = urlPattern.exec(css))) {
    const target = match[2].trim();
    if (target && !target.startsWith('#')) {
      throw new HttpError(400, 'INVALID_CSS_URL', 'External URLs are not allowed in custom CSS.');
    }
  }
  return css;
}

function safeConfig(value, maxChars, cssChars) {
  if (value === undefined || value === null || value === '') return undefined;
  let config = value;
  if (typeof value === 'string') {
    if (value.length > maxChars) throw new HttpError(413, 'CONFIG_TOO_LARGE', 'Config is too large.');
    try {
      config = JSON.parse(value);
    } catch {
      throw new HttpError(400, 'INVALID_CONFIG', 'Config must be valid JSON.');
    }
  }
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new HttpError(400, 'INVALID_CONFIG', 'Config must be a JSON object.');
  }
  const serialized = JSON.stringify(config);
  if (serialized.length > maxChars) throw new HttpError(413, 'CONFIG_TOO_LARGE', 'Config is too large.');

  // Shared/public requests cannot switch Mermaid to loose HTML mode.
  const normalized = { ...config };
  delete normalized.securityLevel;
  delete normalized.startOnLoad;
  delete normalized.secure;
  if (typeof normalized.themeCSS === 'string') {
    normalized.themeCSS = safeCss(normalized.themeCSS, cssChars);
  }
  return normalized;
}

/** Validate and normalize POST body or GET query parameters. */
export function normalizeRenderRequest(
  source,
  {
    formats,
    themes,
    layouts,
    papers,
    backgrounds,
    limits = DEFAULT_LIMITS,
  }
) {
  const input = source && typeof source === 'object' ? source : {};
  const code = typeof input.code === 'string' ? input.code : '';
  if (!code.trim()) throw new HttpError(400, 'MISSING_CODE', 'No diagram code was provided.');
  if (code.length > limits.codeChars) {
    throw new HttpError(413, 'CODE_TOO_LARGE', `Diagram code exceeds ${limits.codeChars} characters.`);
  }

  const format = String(input.format || 'svg').toLowerCase();
  if (!formats.has(format)) throw new HttpError(400, 'INVALID_FORMAT', `Unsupported format: ${format}.`);

  const theme = String(input.theme || 'default');
  if (!themes.has(theme)) throw new HttpError(400, 'INVALID_THEME', `Unsupported theme: ${theme}.`);

  const layout = String(input.layout || 'dagre');
  if (!layouts.has(layout)) throw new HttpError(400, 'INVALID_LAYOUT', `Unsupported layout: ${layout}.`);

  const pdfPaper = String(input.pdfPaper || 'auto').toLowerCase();
  if (!papers.has(pdfPaper)) throw new HttpError(400, 'INVALID_PAPER', `Unsupported PDF paper: ${pdfPaper}.`);

  const css = safeCss(input.css, limits.cssChars);

  return {
    code,
    format,
    theme,
    layout,
    background: safeBackground(input.background, backgrounds),
    scale: clamp(input.scale, 1, limits.scale, 2),
    quality: clamp(input.quality, 1, 100, 92),
    width: input.width ? Math.round(clamp(input.width, 1, limits.width, 1200)) : undefined,
    height: input.height ? Math.round(clamp(input.height, 1, limits.height, 800)) : undefined,
    config: safeConfig(input.config, limits.configChars, limits.cssChars),
    css,
    pdfPaper,
    pdfLandscape: booleanValue(input.pdfLandscape),
    pdfFit: booleanValue(input.pdfFit),
    download: booleanValue(input.download),
    timeoutMs: Math.round(clamp(input.timeoutMs, 1_000, limits.renderTimeoutMs, limits.renderTimeoutMs)),
  };
}

/** Fixed-window in-memory limiter suitable for a single-node deployment. */
export function createRateLimiter({ windowMs = 60_000, max = 30 } = {}) {
  const buckets = new Map();
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }, Math.max(30_000, windowMs));
  cleanup.unref?.();

  return function rateLimit(req, res, next) {
    const key = req.ip || req.socket?.remoteAddress || 'unknown';
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;
    const remaining = Math.max(0, max - bucket.count);
    const resetSeconds = String(Math.ceil(bucket.resetAt / 1000));
    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(remaining));
    res.setHeader('RateLimit-Reset', resetSeconds);
    // Keep the widely-supported legacy names alongside the current draft fields.
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    res.setHeader('X-RateLimit-Reset', resetSeconds);

    if (bucket.count > max) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      return next(new HttpError(429, 'RATE_LIMITED', 'Too many render requests. Please try again later.'));
    }
    return next();
  };
}

/** Bounds expensive Chromium work and queues a small burst instead of spawning freely. */
export function createRenderGate({ concurrency = 2, maxQueue = 20 } = {}) {
  let active = 0;
  const queue = [];

  function release() {
    active = Math.max(0, active - 1);
    const next = queue.shift();
    if (next) next();
  }

  async function acquire() {
    if (active < concurrency) {
      active += 1;
      return;
    }
    if (queue.length >= maxQueue) {
      throw new HttpError(503, 'RENDER_QUEUE_FULL', 'The render service is busy. Please retry shortly.');
    }
    await new Promise((resolve) => queue.push(resolve));
    active += 1;
  }

  return {
    async run(task) {
      await acquire();
      try {
        return await task();
      } finally {
        release();
      }
    },
    stats() {
      return { active, queued: queue.length, concurrency, maxQueue };
    },
  };
}

export function positiveInteger(value, fallback, min = 1, max = Number.MAX_SAFE_INTEGER) {
  return Math.round(clamp(value, min, max, fallback));
}

export { DEFAULT_LIMITS };
