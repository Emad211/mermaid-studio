const KEY_RE = /^[A-Za-z0-9-]{8,128}$/;

export class IndexNowError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'IndexNowError';
    this.status = status;
    this.code = code;
  }
}

function booleanValue(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function integerValue(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function siteOrigin(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:') return '';
    return url.origin;
  } catch {
    return '';
  }
}

export function indexNowConfig(environment = process.env) {
  const key = String(environment.INDEXNOW_KEY || '').trim();
  const siteUrl = siteOrigin(environment.SITE_URL);
  let endpoint = 'https://api.indexnow.org/indexnow';
  try {
    const candidate = new URL(String(environment.INDEXNOW_ENDPOINT || endpoint));
    if (candidate.protocol === 'https:') endpoint = candidate.href;
  } catch {
    // Keep the protocol endpoint.
  }
  return {
    enabled: booleanValue(environment.INDEXNOW_ENABLED) && KEY_RE.test(key) && Boolean(siteUrl),
    key: KEY_RE.test(key) ? key : '',
    siteUrl,
    endpoint,
    timeoutMs: integerValue(environment.INDEXNOW_TIMEOUT_MS, 10_000, 2_000, 60_000),
  };
}

export async function submitIndexNow({ environment = process.env, urls }) {
  const config = indexNowConfig(environment);
  if (!config.enabled) {
    throw new IndexNowError(503, 'INDEXNOW_NOT_CONFIGURED', 'IndexNow is not configured.');
  }
  const host = new URL(config.siteUrl).hostname;
  const unique = [...new Set((urls || []).map((value) => {
    try {
      const url = new URL(value, `${config.siteUrl}/`);
      return url.origin === config.siteUrl ? url.href : '';
    } catch {
      return '';
    }
  }).filter(Boolean))].slice(0, 10_000);
  if (!unique.length) {
    throw new IndexNowError(400, 'INDEXNOW_EMPTY_URLS', 'No valid same-origin URLs were supplied.');
  }

  const keyLocation = `${config.siteUrl}/${config.key}.txt`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  let response;
  try {
    response = await fetch(config.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', Accept: 'application/json,text/plain' },
      body: JSON.stringify({ host, key: config.key, keyLocation, urlList: unique }),
      signal: controller.signal,
    });
  } catch (error) {
    throw new IndexNowError(504, 'INDEXNOW_TIMEOUT', `IndexNow request failed: ${error.message}`);
  } finally {
    clearTimeout(timeout);
  }
  const responseText = await response.text().catch(() => '');
  if (![200, 202].includes(response.status)) {
    throw new IndexNowError(response.status === 429 ? 429 : 502, 'INDEXNOW_SUBMIT_FAILED', `IndexNow returned ${response.status}${responseText ? `: ${responseText.slice(0, 240)}` : ''}.`);
  }
  return {
    submitted: unique.length,
    status: response.status,
    keyLocation,
    endpoint: config.endpoint,
    submittedAt: new Date().toISOString(),
  };
}

export { KEY_RE };
