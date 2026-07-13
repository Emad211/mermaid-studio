import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const EVENT_NAMES = new Set([
  'page_view',
  'engagement',
  'editor_open',
  'render_success',
  'render_error',
  'export',
  'copy_svg',
  'share',
  'template_open',
  'ad_slot_view',
  'ad_script_loaded',
  'ad_script_error',
  'ad_blocked',
  'web_vitals',
]);

const EXPORT_FORMATS = new Set(['svg', 'png', 'jpg', 'jpeg', 'webp', 'pdf', 'clipboard']);
const PROVIDERS = new Set(['yektanet', 'tapsell', 'other']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_UNIQUE_PER_DAY = 250_000;
const MAX_VITAL_SAMPLES_PER_DAY = 10_000;
const MAX_COUNTER_KEYS = 2_000;

export class AnalyticsError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'AnalyticsError';
    this.status = status;
    this.code = code;
  }
}

function envBoolean(env, name, fallback = false) {
  const value = env[name];
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function envInteger(env, name, fallback, min, max) {
  const number = Number(env[name]);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max, fallback = min) {
  return Math.min(max, Math.max(min, finite(value, fallback)));
}

function safeText(value, maxLength = 120) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, maxLength);
}

function safeKey(value, maxLength = 100) {
  const text = safeText(value, maxLength);
  return /^[\p{L}\p{N}_.:/@+ -]*$/u.test(text) ? text : '';
}

function normalizePathname(value) {
  const text = safeText(value || '/', 260);
  try {
    const url = new URL(text, 'https://analytics.invalid');
    const pathname = url.pathname.replace(/\/{2,}/g, '/');
    return pathname.startsWith('/') ? pathname.slice(0, 220) : '/';
  } catch {
    return '/';
  }
}

function normalizeHost(value) {
  const text = safeText(value, 260).toLowerCase();
  if (!text) return 'direct';
  try {
    const url = text.includes('://') ? new URL(text) : new URL(`https://${text}`);
    return url.hostname.replace(/^www\./, '').slice(0, 160) || 'direct';
  } catch {
    return 'direct';
  }
}

function isoDay(date = new Date(), timeZone = 'Asia/Tehran') {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function parseIsoDay(value, fallback) {
  const text = String(value || '');
  if (!DATE_RE.test(text)) return fallback;
  const date = new Date(`${text}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? fallback : text;
}

function addUtcDays(day, amount) {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function enumerateDays(from, to) {
  const result = [];
  for (let day = from; day <= to; day = addUtcDays(day, 1)) {
    result.push(day);
    if (result.length > 400) break;
  }
  return result;
}

function increment(object, key, amount = 1) {
  if (!key) return;
  if (!Object.prototype.hasOwnProperty.call(object, key) && Object.keys(object).length >= MAX_COUNTER_KEYS) {
    key = 'سایر';
  }
  object[key] = finite(object[key]) + amount;
}

function mergeCounters(target, source) {
  for (const [key, value] of Object.entries(source || {})) increment(target, key, finite(value));
  return target;
}

function topCounter(counter, limit = 20) {
  return Object.entries(counter || {})
    .map(([name, value]) => ({ name, value: finite(value) }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, 'fa'))
    .slice(0, limit);
}

function percentile(values, percentileValue = 0.75) {
  const sorted = (values || []).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const index = Math.max(0, Math.ceil(sorted.length * percentileValue) - 1);
  return sorted[index];
}

function classifyDevice(userAgent) {
  const ua = String(userAgent || '').toLowerCase();
  if (/bot|crawler|spider|slurp|bingpreview|facebookexternalhit|whatsapp|telegrambot|headlesschrome|lighthouse/.test(ua)) return 'bot';
  if (/ipad|tablet|kindle|silk|playbook/.test(ua)) return 'tablet';
  if (/mobi|iphone|android/.test(ua)) return 'mobile';
  return 'desktop';
}

function classifyBrowser(userAgent) {
  const ua = String(userAgent || '');
  if (/Edg\//.test(ua)) return 'Edge';
  if (/OPR\//.test(ua)) return 'Opera';
  if (/Firefox\//.test(ua)) return 'Firefox';
  if (/CriOS\//.test(ua)) return 'Chrome iOS';
  if (/Chrome\//.test(ua)) return 'Chrome';
  if (/Safari\//.test(ua) && /Version\//.test(ua)) return 'Safari';
  return 'Other';
}

function classifyOs(userAgent) {
  const ua = String(userAgent || '');
  if (/Android/.test(ua)) return 'Android';
  if (/iPhone|iPad|iPod/.test(ua)) return 'iOS';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Mac OS X/.test(ua)) return 'macOS';
  if (/Linux/.test(ua)) return 'Linux';
  return 'Other';
}

function acquisitionChannel(referrer, utmSource, utmMedium) {
  const medium = String(utmMedium || '').toLowerCase();
  const source = String(utmSource || '').toLowerCase();
  if (medium === 'cpc' || medium === 'ppc' || medium === 'paid' || medium === 'display') return 'paid';
  if (medium === 'email') return 'email';
  if (medium.includes('social')) return 'social';
  if (source) return `campaign:${source}`;
  if (referrer === 'direct') return 'direct';
  if (/google\.|bing\.|yahoo\.|duckduckgo\.|yandex\./.test(referrer)) return 'organic-search';
  if (/instagram\.|t\.co$|twitter\.|linkedin\.|facebook\.|telegram\.|t\.me$/.test(referrer)) return 'social';
  return 'referral';
}

function emptyDay(day) {
  return {
    version: 1,
    date: day,
    totals: {
      pageviews: 0,
      sessions: 0,
      visitors: 0,
      engagedSessions: 0,
      engagementSeconds: 0,
      bots: 0,
    },
    unique: { sessions: [], visitors: [], engagedSessions: [] },
    events: {},
    exports: {},
    pages: {},
    referrers: {},
    channels: {},
    campaigns: {},
    devices: {},
    browsers: {},
    operatingSystems: {},
    countries: {},
    adSlots: {},
    vitals: { lcp: [], inp: [], cls: [], ttfb: [], fcp: [] },
  };
}

function hydrateDay(value, day) {
  const fresh = emptyDay(day);
  const persisted = value && typeof value === 'object' ? value : {};
  const merged = {
    ...fresh,
    ...persisted,
    totals: { ...fresh.totals, ...(persisted.totals || {}) },
    unique: { ...fresh.unique, ...(persisted.unique || {}) },
    vitals: { ...fresh.vitals, ...(persisted.vitals || {}) },
  };
  Object.defineProperties(merged, {
    _sessionSet: { value: new Set(merged.unique.sessions || []), enumerable: false },
    _visitorSet: { value: new Set(merged.unique.visitors || []), enumerable: false },
    _engagedSet: { value: new Set(merged.unique.engagedSessions || []), enumerable: false },
  });
  return merged;
}

function hashIdentifier(secret, day, value) {
  return crypto.createHmac('sha256', secret).update(`${day}\u0000${value}`).digest('base64url').slice(0, 24);
}

function requestAddress(req) {
  return String(req.ip || req.socket?.remoteAddress || 'unknown').slice(0, 120);
}

async function atomicWrite(filePath, value) {
  const directory = path.dirname(filePath);
  await fs.mkdir(directory, { recursive: true });
  const temporary = `${filePath}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(value), { encoding: 'utf8', mode: 0o600 });
  await fs.rename(temporary, filePath);
}

function safeMetric(value, min, max) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function normalizeAnalyticsEvent(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new AnalyticsError(400, 'INVALID_ANALYTICS_EVENT', 'Analytics event must be a JSON object.');
  }
  const event = safeText(body.event, 40);
  if (!EVENT_NAMES.has(event)) {
    throw new AnalyticsError(400, 'UNKNOWN_ANALYTICS_EVENT', 'Unknown analytics event.');
  }
  return {
    event,
    session: safeKey(body.session, 80),
    path: normalizePathname(body.path),
    referrer: normalizeHost(body.referrer),
    utmSource: safeKey(body.utmSource, 80).toLowerCase(),
    utmMedium: safeKey(body.utmMedium, 80).toLowerCase(),
    utmCampaign: safeKey(body.utmCampaign, 120),
    format: safeText(body.format, 16).toLowerCase(),
    slot: safeKey(body.slot, 100),
    seconds: clamp(body.seconds, 0, 300, 0),
    metrics: body.metrics && typeof body.metrics === 'object' ? body.metrics : {},
  };
}

function normalizeRevenueEntry(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new AnalyticsError(400, 'INVALID_REVENUE_ENTRY', 'Revenue entry must be an object.');
  }
  const date = parseIsoDay(input.date, '');
  if (!date) throw new AnalyticsError(400, 'INVALID_REVENUE_DATE', 'Revenue date must use YYYY-MM-DD.');
  const provider = safeText(input.provider, 30).toLowerCase();
  if (!PROVIDERS.has(provider)) throw new AnalyticsError(400, 'INVALID_REVENUE_PROVIDER', 'Unsupported revenue provider.');
  const impressions = Math.round(clamp(input.impressions, 0, 1_000_000_000_000, 0));
  const clicks = Math.round(clamp(input.clicks, 0, 1_000_000_000_000, 0));
  if (impressions > 0 && clicks > impressions) {
    throw new AnalyticsError(400, 'INVALID_REVENUE_CLICKS', 'Clicks cannot exceed impressions.');
  }
  return {
    id: safeKey(input.id, 80) || crypto.randomUUID(),
    date,
    provider,
    slot: safeKey(input.slot || 'all', 100) || 'all',
    impressions,
    clicks,
    revenueRial: Math.round(clamp(input.revenueRial, 0, 10_000_000_000_000_000, 0)),
    note: safeText(input.note, 240),
    source: safeKey(input.source || 'manual', 30) || 'manual',
    importedAt: new Date().toISOString(),
  };
}

function normalizeSearchRow(input, defaultDate) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const date = parseIsoDay(input.date, defaultDate);
  const query = safeText(input.query, 240);
  const page = safeText(input.page, 500);
  if (!date || (!query && !page)) return null;
  const impressions = Math.round(clamp(input.impressions, 0, 1_000_000_000_000, 0));
  const clicks = Math.round(clamp(input.clicks, 0, impressions || 1_000_000_000_000, 0));
  return {
    date,
    query,
    page,
    clicks,
    impressions,
    position: clamp(input.position, 0, 1_000, 0),
  };
}

function basicCredentials(req) {
  const header = String(req.headers.authorization || '');
  if (!header.startsWith('Basic ')) return null;
  try {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const separator = decoded.indexOf(':');
    if (separator < 0) return null;
    return { user: decoded.slice(0, separator), password: decoded.slice(separator + 1) };
  } catch {
    return null;
  }
}

function timingSafeTextEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function analyticsConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const adminUser = safeText(env.ANALYTICS_ADMIN_USER || 'admin', 80);
  const adminPassword = String(env.ANALYTICS_ADMIN_PASSWORD || '');
  const blockedPasswords = new Set(['change-me', 'changeme', 'password', 'admin', '123456789012']);
  const adminConfigured = adminPassword.length >= 12 && !blockedPasswords.has(adminPassword.toLowerCase());
  const configuredSecret = String(env.ANALYTICS_HASH_SECRET || '');
  const secret = configuredSecret.length >= 24
    ? configuredSecret
    : crypto.createHash('sha256').update(`${adminPassword || crypto.randomUUID()}|${process.pid}`).digest('hex');

  return {
    enabled: envBoolean(env, 'ANALYTICS_ENABLED', production),
    respectDnt: envBoolean(env, 'ANALYTICS_RESPECT_DNT', true),
    dataDir: path.resolve(env.ANALYTICS_DATA_DIR || (production ? '/data/analytics' : '.data/analytics')),
    timeZone: safeText(env.ANALYTICS_TIME_ZONE || 'Asia/Tehran', 80) || 'Asia/Tehran',
    retentionDays: envInteger(env, 'ANALYTICS_RETENTION_DAYS', 400, 30, 3_650),
    estimatedRpmRial: envInteger(env, 'ANALYTICS_ESTIMATED_RPM_RIAL', 0, 0, 100_000_000),
    countryHeader: safeText(env.ANALYTICS_COUNTRY_HEADER || '', 80).toLowerCase(),
    adminUser,
    adminPassword,
    adminConfigured,
    secret,
    secretPersisted: configuredSecret.length >= 24,
  };
}

class AnalyticsService {
  constructor(config, logger = console) {
    this.config = config;
    this.logger = logger;
    this.cache = new Map();
    this.dirtyDays = new Set();
    this.readyPromise = null;
    this.operation = Promise.resolve();
    this.flushTimer = null;
    this.lastError = null;
    this.authFailures = new Map();
  }

  publicConfig() {
    return {
      enabled: this.config.enabled,
      respectDnt: this.config.respectDnt,
      webVitals: true,
      maxEventBytes: 4_096,
    };
  }

  health() {
    return {
      enabled: this.config.enabled,
      adminConfigured: this.config.adminConfigured,
      persistentHashSecret: this.config.secretPersisted,
      lastError: this.lastError,
    };
  }

  enqueue(task) {
    const result = this.operation.catch(() => {}).then(task);
    this.operation = result.catch((error) => {
      this.lastError = error?.message || String(error);
      this.logger.error('[analytics:operation]', error);
    });
    return result;
  }

  async init() {
    if (!this.config.enabled) return;
    if (!this.readyPromise) {
      this.readyPromise = (async () => {
        await fs.mkdir(this.config.dataDir, { recursive: true, mode: 0o700 });
        await this.cleanup();
      })().catch((error) => {
        this.lastError = error.message;
        this.logger.error('[analytics:init]', error);
        throw error;
      });
    }
    await this.readyPromise;
  }

  dayPath(day) {
    return path.join(this.config.dataDir, `day-${day}.json`);
  }

  revenuePath() {
    return path.join(this.config.dataDir, 'revenue.json');
  }

  searchPath() {
    return path.join(this.config.dataDir, 'search-performance.json');
  }

  async cleanup() {
    let entries = [];
    try {
      entries = await fs.readdir(this.config.dataDir);
    } catch {
      return;
    }
    const today = isoDay(new Date(), this.config.timeZone);
    const oldest = addUtcDays(today, -this.config.retentionDays);
    await Promise.all(entries.map(async (name) => {
      const match = /^day-(\d{4}-\d{2}-\d{2})\.json$/.exec(name);
      if (match && match[1] < oldest) {
        await fs.rm(path.join(this.config.dataDir, name), { force: true });
        this.cache.delete(match[1]);
      }
    }));
  }

  async loadDay(day, create = true) {
    if (this.cache.has(day)) return this.cache.get(day);
    try {
      const value = JSON.parse(await fs.readFile(this.dayPath(day), 'utf8'));
      const hydrated = hydrateDay(value, day);
      this.cache.set(day, hydrated);
      return hydrated;
    } catch (error) {
      if (error.code !== 'ENOENT') {
        this.lastError = error.message;
        this.logger.error('[analytics:read-day]', error);
      }
      if (!create) return null;
      const hydrated = hydrateDay(null, day);
      this.cache.set(day, hydrated);
      return hydrated;
    }
  }

  markDirty(day) {
    this.dirtyDays.add(day);
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush().catch((error) => {
        this.lastError = error.message;
        this.logger.error('[analytics:flush]', error);
      });
    }, 1_500);
    this.flushTimer.unref?.();
  }

  async flush() {
    if (!this.config.enabled) return;
    await this.init();
    const days = [...this.dirtyDays];
    this.dirtyDays.clear();
    for (const day of days) {
      const value = this.cache.get(day);
      if (!value) continue;
      try {
        await atomicWrite(this.dayPath(day), value);
      } catch (error) {
        this.dirtyDays.add(day);
        throw error;
      }
    }
  }

  async close() {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = null;
    await this.operation.catch(() => {});
    await this.flush().catch(() => {});
  }

  record(body, req) {
    if (!this.config.enabled) return Promise.resolve();
    const payload = normalizeAnalyticsEvent(body);
    return this.enqueue(async () => {
      await this.init();
      const day = isoDay(new Date(), this.config.timeZone);
      const data = await this.loadDay(day);
      const userAgent = String(req.headers['user-agent'] || '');
      const device = classifyDevice(userAgent);
      if (device === 'bot') {
        data.totals.bots += 1;
        this.markDirty(day);
        return;
      }

      const sessionSource = payload.session || `${requestAddress(req)}|${userAgent}|sessionless`;
      const sessionHash = hashIdentifier(this.config.secret, day, sessionSource);
      const visitorHash = hashIdentifier(this.config.secret, day, `${requestAddress(req)}|${userAgent}`);
      const isNewSession = !data._sessionSet.has(sessionHash);
      const isNewVisitor = !data._visitorSet.has(visitorHash);

      increment(data.events, payload.event);

      if (payload.event === 'page_view') {
        data.totals.pageviews += 1;
        data.pages[payload.path] ||= { pageviews: 0, sessions: 0, engagementSeconds: 0 };
        data.pages[payload.path].pageviews += 1;

        if (isNewSession) {
          if (data._sessionSet.size < MAX_UNIQUE_PER_DAY) {
            data._sessionSet.add(sessionHash);
            data.unique.sessions.push(sessionHash);
          }
          data.totals.sessions += 1;
          data.pages[payload.path].sessions += 1;
          increment(data.referrers, payload.referrer);
          increment(data.channels, acquisitionChannel(payload.referrer, payload.utmSource, payload.utmMedium));
          if (payload.utmSource || payload.utmCampaign) {
            const campaign = [payload.utmSource || '(none)', payload.utmMedium || '(none)', payload.utmCampaign || '(none)'].join(' / ');
            increment(data.campaigns, campaign);
          }
          increment(data.devices, device);
          increment(data.browsers, classifyBrowser(userAgent));
          increment(data.operatingSystems, classifyOs(userAgent));
          const country = this.config.countryHeader ? safeKey(req.headers[this.config.countryHeader], 10).toUpperCase() : '';
          if (country) increment(data.countries, country);
        }

        if (isNewVisitor && data._visitorSet.size < MAX_UNIQUE_PER_DAY) {
          data._visitorSet.add(visitorHash);
          data.unique.visitors.push(visitorHash);
          data.totals.visitors += 1;
        }
      }

      if (payload.event === 'engagement' && payload.seconds > 0) {
        data.totals.engagementSeconds += payload.seconds;
        data.pages[payload.path] ||= { pageviews: 0, sessions: 0, engagementSeconds: 0 };
        data.pages[payload.path].engagementSeconds += payload.seconds;
        if (payload.seconds >= 10 && !data._engagedSet.has(sessionHash)) {
          if (data._engagedSet.size < MAX_UNIQUE_PER_DAY) {
            data._engagedSet.add(sessionHash);
            data.unique.engagedSessions.push(sessionHash);
          }
          data.totals.engagedSessions += 1;
        }
      }

      if (payload.event === 'export' && EXPORT_FORMATS.has(payload.format)) {
        increment(data.exports, payload.format === 'jpeg' ? 'jpg' : payload.format);
      }

      if (payload.event.startsWith('ad_') && payload.slot) {
        data.adSlots[payload.slot] ||= { views: 0, loaded: 0, errors: 0, blocked: 0 };
        if (payload.event === 'ad_slot_view') data.adSlots[payload.slot].views += 1;
        if (payload.event === 'ad_script_loaded') data.adSlots[payload.slot].loaded += 1;
        if (payload.event === 'ad_script_error') data.adSlots[payload.slot].errors += 1;
        if (payload.event === 'ad_blocked') data.adSlots[payload.slot].blocked += 1;
      }

      if (payload.event === 'web_vitals') {
        const values = {
          lcp: safeMetric(payload.metrics.lcp, 0, 120_000),
          inp: safeMetric(payload.metrics.inp, 0, 120_000),
          cls: safeMetric(payload.metrics.cls, 0, 20),
          ttfb: safeMetric(payload.metrics.ttfb, 0, 120_000),
          fcp: safeMetric(payload.metrics.fcp, 0, 120_000),
        };
        for (const [metric, value] of Object.entries(values)) {
          if (value !== null && data.vitals[metric].length < MAX_VITAL_SAMPLES_PER_DAY) {
            data.vitals[metric].push(value);
          }
        }
      }

      this.markDirty(day);
    });
  }

  async loadCollection(filePath, fallback) {
    try {
      const value = JSON.parse(await fs.readFile(filePath, 'utf8'));
      return value && typeof value === 'object' ? value : fallback;
    } catch (error) {
      if (error.code !== 'ENOENT') {
        this.lastError = error.message;
        this.logger.error('[analytics:read-collection]', error);
      }
      return fallback;
    }
  }

  addRevenue(entries) {
    if (!this.config.enabled) throw new AnalyticsError(503, 'ANALYTICS_DISABLED', 'Analytics is disabled.');
    const list = Array.isArray(entries) ? entries : [entries];
    if (!list.length || list.length > 1_000) {
      throw new AnalyticsError(400, 'INVALID_REVENUE_BATCH', 'Revenue batch must contain between 1 and 1000 entries.');
    }
    const normalized = list.map(normalizeRevenueEntry);
    return this.enqueue(async () => {
      await this.init();
      const collection = await this.loadCollection(this.revenuePath(), { version: 1, entries: [] });
      const byId = new Map((collection.entries || []).map((entry) => [entry.id, entry]));
      normalized.forEach((entry) => byId.set(entry.id, entry));
      collection.entries = [...byId.values()].sort((a, b) => a.date.localeCompare(b.date) || a.provider.localeCompare(b.provider));
      await atomicWrite(this.revenuePath(), collection);
      return normalized;
    });
  }

  deleteRevenue(id) {
    const safeId = safeKey(id, 80);
    if (!safeId) throw new AnalyticsError(400, 'INVALID_REVENUE_ID', 'Invalid revenue entry id.');
    return this.enqueue(async () => {
      await this.init();
      const collection = await this.loadCollection(this.revenuePath(), { version: 1, entries: [] });
      const before = collection.entries.length;
      collection.entries = collection.entries.filter((entry) => entry.id !== safeId);
      if (collection.entries.length === before) throw new AnalyticsError(404, 'REVENUE_NOT_FOUND', 'Revenue entry not found.');
      await atomicWrite(this.revenuePath(), collection);
    });
  }

  importSearch(rows, defaultDate = isoDay(new Date(), this.config.timeZone)) {
    if (!this.config.enabled) throw new AnalyticsError(503, 'ANALYTICS_DISABLED', 'Analytics is disabled.');
    if (!Array.isArray(rows) || !rows.length || rows.length > 10_000) {
      throw new AnalyticsError(400, 'INVALID_SEARCH_BATCH', 'Search batch must contain between 1 and 10000 rows.');
    }
    const normalized = rows.map((row) => normalizeSearchRow(row, defaultDate)).filter(Boolean);
    if (!normalized.length) throw new AnalyticsError(400, 'EMPTY_SEARCH_BATCH', 'No valid Search Console rows were supplied.');
    return this.enqueue(async () => {
      await this.init();
      const collection = await this.loadCollection(this.searchPath(), { version: 1, rows: [] });
      const map = new Map();
      for (const row of [...(collection.rows || []), ...normalized]) {
        const key = `${row.date}\u0000${row.query}\u0000${row.page}`;
        const current = map.get(key) || { ...row, clicks: 0, impressions: 0, weightedPosition: 0 };
        current.clicks += row.clicks;
        current.impressions += row.impressions;
        current.weightedPosition += row.position * Math.max(1, row.impressions);
        current.position = current.weightedPosition / Math.max(1, current.impressions);
        map.set(key, current);
      }
      collection.rows = [...map.values()].map(({ weightedPosition, ...row }) => row);
      await atomicWrite(this.searchPath(), collection);
      return normalized.length;
    });
  }

  async summary({ from, to, days = 30 } = {}) {
    if (!this.config.enabled) {
      return { enabled: false, adminConfigured: this.config.adminConfigured };
    }
    await this.init();
    await this.operation;
    await this.flush();

    const today = isoDay(new Date(), this.config.timeZone);
    const safeTo = parseIsoDay(to, today);
    const fallbackFrom = addUtcDays(safeTo, -(Math.min(400, Math.max(1, Number(days) || 30)) - 1));
    const safeFrom = parseIsoDay(from, fallbackFrom);
    if (safeFrom > safeTo || enumerateDays(safeFrom, safeTo).length > 400) {
      throw new AnalyticsError(400, 'INVALID_ANALYTICS_RANGE', 'Analytics range is invalid or exceeds 400 days.');
    }

    const totals = { pageviews: 0, sessions: 0, visitors: 0, engagedSessions: 0, engagementSeconds: 0, bots: 0 };
    const events = {};
    const exportsByFormat = {};
    const pages = {};
    const referrers = {};
    const channels = {};
    const campaigns = {};
    const devices = {};
    const browsers = {};
    const operatingSystems = {};
    const countries = {};
    const adSlots = {};
    const vitalSamples = { lcp: [], inp: [], cls: [], ttfb: [], fcp: [] };
    const dailyMap = new Map();

    for (const day of enumerateDays(safeFrom, safeTo)) {
      const value = await this.loadDay(day, false);
      const daily = {
        date: day,
        pageviews: 0,
        sessions: 0,
        visitors: 0,
        engagedSessions: 0,
        engagementSeconds: 0,
        exports: 0,
        adSlotViews: 0,
        revenueRial: 0,
        impressions: 0,
        clicks: 0,
        searchClicks: 0,
        searchImpressions: 0,
      };
      if (value) {
        for (const key of Object.keys(totals)) totals[key] += finite(value.totals[key]);
        mergeCounters(events, value.events);
        mergeCounters(exportsByFormat, value.exports);
        mergeCounters(referrers, value.referrers);
        mergeCounters(channels, value.channels);
        mergeCounters(campaigns, value.campaigns);
        mergeCounters(devices, value.devices);
        mergeCounters(browsers, value.browsers);
        mergeCounters(operatingSystems, value.operatingSystems);
        mergeCounters(countries, value.countries);
        for (const [page, stats] of Object.entries(value.pages || {})) {
          pages[page] ||= { pageviews: 0, sessions: 0, engagementSeconds: 0 };
          pages[page].pageviews += finite(stats.pageviews);
          pages[page].sessions += finite(stats.sessions);
          pages[page].engagementSeconds += finite(stats.engagementSeconds);
        }
        for (const [slot, stats] of Object.entries(value.adSlots || {})) {
          adSlots[slot] ||= { views: 0, loaded: 0, errors: 0, blocked: 0 };
          for (const key of Object.keys(adSlots[slot])) adSlots[slot][key] += finite(stats[key]);
        }
        for (const metric of Object.keys(vitalSamples)) vitalSamples[metric].push(...(value.vitals?.[metric] || []));
        Object.assign(daily, {
          pageviews: finite(value.totals.pageviews),
          sessions: finite(value.totals.sessions),
          visitors: finite(value.totals.visitors),
          engagedSessions: finite(value.totals.engagedSessions),
          engagementSeconds: finite(value.totals.engagementSeconds),
          exports: Object.values(value.exports || {}).reduce((sum, number) => sum + finite(number), 0),
          adSlotViews: Object.values(value.adSlots || {}).reduce((sum, stats) => sum + finite(stats.views), 0),
        });
      }
      dailyMap.set(day, daily);
    }

    const revenueCollection = await this.loadCollection(this.revenuePath(), { version: 1, entries: [] });
    const revenueEntries = (revenueCollection.entries || []).filter((entry) => entry.date >= safeFrom && entry.date <= safeTo);
    const revenueByProvider = {};
    const revenueBySlot = {};
    let actualRevenueRial = 0;
    let impressions = 0;
    let clicks = 0;
    for (const entry of revenueEntries) {
      actualRevenueRial += finite(entry.revenueRial);
      impressions += finite(entry.impressions);
      clicks += finite(entry.clicks);
      revenueByProvider[entry.provider] ||= { revenueRial: 0, impressions: 0, clicks: 0 };
      revenueBySlot[entry.slot] ||= { revenueRial: 0, impressions: 0, clicks: 0 };
      for (const target of [revenueByProvider[entry.provider], revenueBySlot[entry.slot]]) {
        target.revenueRial += finite(entry.revenueRial);
        target.impressions += finite(entry.impressions);
        target.clicks += finite(entry.clicks);
      }
      const daily = dailyMap.get(entry.date);
      if (daily) {
        daily.revenueRial += finite(entry.revenueRial);
        daily.impressions += finite(entry.impressions);
        daily.clicks += finite(entry.clicks);
      }
    }

    const searchCollection = await this.loadCollection(this.searchPath(), { version: 1, rows: [] });
    const searchRows = (searchCollection.rows || []).filter((row) => row.date >= safeFrom && row.date <= safeTo);
    const queryMap = {};
    const searchPageMap = {};
    let searchClicks = 0;
    let searchImpressions = 0;
    let weightedPosition = 0;
    for (const row of searchRows) {
      searchClicks += finite(row.clicks);
      searchImpressions += finite(row.impressions);
      weightedPosition += finite(row.position) * Math.max(1, finite(row.impressions));
      if (row.query) {
        queryMap[row.query] ||= { clicks: 0, impressions: 0, weightedPosition: 0 };
        queryMap[row.query].clicks += finite(row.clicks);
        queryMap[row.query].impressions += finite(row.impressions);
        queryMap[row.query].weightedPosition += finite(row.position) * Math.max(1, finite(row.impressions));
      }
      if (row.page) {
        searchPageMap[row.page] ||= { clicks: 0, impressions: 0, weightedPosition: 0 };
        searchPageMap[row.page].clicks += finite(row.clicks);
        searchPageMap[row.page].impressions += finite(row.impressions);
        searchPageMap[row.page].weightedPosition += finite(row.position) * Math.max(1, finite(row.impressions));
      }
      const daily = dailyMap.get(row.date);
      if (daily) {
        daily.searchClicks += finite(row.clicks);
        daily.searchImpressions += finite(row.impressions);
      }
    }

    const mapSearch = (map) => Object.entries(map).map(([name, stats]) => ({
      name,
      clicks: stats.clicks,
      impressions: stats.impressions,
      ctr: stats.impressions ? (stats.clicks / stats.impressions) * 100 : 0,
      position: stats.weightedPosition / Math.max(1, stats.impressions),
    })).sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions).slice(0, 50);

    const totalExports = Object.values(exportsByFormat).reduce((sum, number) => sum + finite(number), 0);
    const totalAdSlotViews = Object.values(adSlots).reduce((sum, stats) => sum + finite(stats.views), 0);
    const totalRenders = finite(events.render_success) + finite(events.render_error);
    const estimatedRevenueRial = Math.round((totals.pageviews * this.config.estimatedRpmRial) / 1_000);
    const dailyValues = [...dailyMap.values()];
    const lastSeven = dailyValues.slice(-7);
    const actualDays = lastSeven.filter((row) => row.revenueRial > 0);
    const forecast30Rial = actualDays.length
      ? Math.round((actualDays.reduce((sum, row) => sum + row.revenueRial, 0) / actualDays.length) * 30)
      : Math.round((lastSeven.reduce((sum, row) => sum + row.pageviews, 0) / Math.max(1, lastSeven.length)) * this.config.estimatedRpmRial / 1_000 * 30);

    const vitals = {
      lcp: { p75: percentile(vitalSamples.lcp), goodThreshold: 2_500, unit: 'ms' },
      inp: { p75: percentile(vitalSamples.inp), goodThreshold: 200, unit: 'ms' },
      cls: { p75: percentile(vitalSamples.cls), goodThreshold: 0.1, unit: 'score' },
      ttfb: { p75: percentile(vitalSamples.ttfb), goodThreshold: 800, unit: 'ms' },
      fcp: { p75: percentile(vitalSamples.fcp), goodThreshold: 1_800, unit: 'ms' },
    };
    for (const value of Object.values(vitals)) value.good = value.p75 === null ? null : value.p75 <= value.goodThreshold;

    return {
      enabled: true,
      adminConfigured: this.config.adminConfigured,
      from: safeFrom,
      to: safeTo,
      timeZone: this.config.timeZone,
      totals: {
        ...totals,
        exports: totalExports,
        adSlotViews: totalAdSlotViews,
        actualRevenueRial,
        estimatedRevenueRial,
        impressions,
        clicks,
        searchClicks,
        searchImpressions,
      },
      rates: {
        bounceRate: totals.sessions ? Math.max(0, (1 - totals.engagedSessions / totals.sessions) * 100) : 0,
        avgEngagementSeconds: totals.sessions ? totals.engagementSeconds / totals.sessions : 0,
        editorOpenRate: totals.sessions ? (finite(events.editor_open) / totals.sessions) * 100 : 0,
        renderSuccessRate: totalRenders ? (finite(events.render_success) / totalRenders) * 100 : 0,
        exportsPerSession: totals.sessions ? totalExports / totals.sessions : 0,
        pageRpmRial: totals.pageviews ? (actualRevenueRial / totals.pageviews) * 1_000 : 0,
        sessionRpmRial: totals.sessions ? (actualRevenueRial / totals.sessions) * 1_000 : 0,
        ctr: impressions ? (clicks / impressions) * 100 : 0,
        cpcRial: clicks ? actualRevenueRial / clicks : 0,
        ecpmRial: impressions ? (actualRevenueRial / impressions) * 1_000 : 0,
        fillRate: totalAdSlotViews ? (impressions / totalAdSlotViews) * 100 : 0,
        searchCtr: searchImpressions ? (searchClicks / searchImpressions) * 100 : 0,
        averageSearchPosition: weightedPosition / Math.max(1, searchImpressions),
      },
      forecast: { next30DaysRial: forecast30Rial, estimatedRpmRial: this.config.estimatedRpmRial },
      daily: dailyValues,
      events,
      exportsByFormat,
      topPages: Object.entries(pages).map(([name, stats]) => ({ name, ...stats })).sort((a, b) => b.pageviews - a.pageviews).slice(0, 50),
      referrers: topCounter(referrers, 30),
      channels: topCounter(channels, 20),
      campaigns: topCounter(campaigns, 30),
      devices: topCounter(devices, 10),
      browsers: topCounter(browsers, 10),
      operatingSystems: topCounter(operatingSystems, 10),
      countries: topCounter(countries, 30),
      adSlots: Object.entries(adSlots).map(([name, stats]) => ({ name, ...stats })).sort((a, b) => b.views - a.views),
      vitals,
      revenue: {
        entries: revenueEntries.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 500),
        byProvider: Object.entries(revenueByProvider).map(([name, stats]) => ({ name, ...stats })),
        bySlot: Object.entries(revenueBySlot).map(([name, stats]) => ({ name, ...stats })).sort((a, b) => b.revenueRial - a.revenueRial),
      },
      search: {
        rows: searchRows.length,
        topQueries: mapSearch(queryMap),
        topPages: mapSearch(searchPageMap),
      },
    };
  }

  async csv(options) {
    const summary = await this.summary(options);
    const header = [
      'date', 'pageviews', 'sessions', 'visitors', 'engaged_sessions', 'engagement_seconds',
      'exports', 'ad_slot_views', 'revenue_rial', 'impressions', 'clicks', 'search_clicks', 'search_impressions',
    ];
    const rows = summary.daily.map((row) => header.map((key) => row[key] ?? '').join(','));
    return [header.join(','), ...rows].join('\n') + '\n';
  }

  adminAuth(req, res, next) {
    if (!this.config.adminConfigured) {
      res.status(404).end();
      return;
    }
    const address = requestAddress(req);
    const now = Date.now();
    const state = this.authFailures.get(address);
    if (state && state.blockedUntil > now) {
      res.setHeader('Retry-After', String(Math.ceil((state.blockedUntil - now) / 1_000)));
      res.status(429).end();
      return;
    }
    const credentials = basicCredentials(req);
    const valid = credentials
      && timingSafeTextEqual(credentials.user, this.config.adminUser)
      && timingSafeTextEqual(credentials.password, this.config.adminPassword);
    if (!valid) {
      const failures = state && state.expiresAt > now ? state.failures + 1 : 1;
      this.authFailures.set(address, {
        failures,
        expiresAt: now + 15 * 60_000,
        blockedUntil: failures >= 8 ? now + 15 * 60_000 : 0,
      });
      res.setHeader('WWW-Authenticate', 'Basic realm="Mermaid Studio Analytics", charset="UTF-8"');
      res.status(401).end();
      return;
    }
    this.authFailures.delete(address);
    res.setHeader('Cache-Control', 'no-store, private');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    next();
  }
}

export function createAnalyticsService({ env = process.env, logger = console } = {}) {
  return new AnalyticsService(analyticsConfig(env), logger);
}
