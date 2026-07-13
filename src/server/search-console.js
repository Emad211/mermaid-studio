import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
const API_ROOT = 'https://www.googleapis.com/webmasters/v3/sites';

export class SearchConsoleError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'SearchConsoleError';
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

function safeDate(value) {
  const text = String(value || '');
  if (!DATE_RE.test(text)) return '';
  return Number.isNaN(new Date(`${text}T00:00:00.000Z`).getTime()) ? '' : text;
}

function safeSite(value) {
  const text = String(value || '').trim();
  if (/^sc-domain:[a-z0-9.-]+$/i.test(text)) return text.toLowerCase();
  try {
    const url = new URL(text);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    url.hash = '';
    url.search = '';
    return url.href;
  } catch {
    return '';
  }
}

function base64url(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

export function searchConsoleConfig(environment = process.env) {
  const credentialsFile = String(environment.GSC_SERVICE_ACCOUNT_FILE || '').trim();
  const credentialsBase64 = String(environment.GSC_SERVICE_ACCOUNT_B64 || '').trim();
  const siteUrl = safeSite(environment.GSC_SITE_URL || environment.SITE_URL);
  const enabled = booleanValue(environment.GSC_ENABLED) && Boolean(siteUrl) && Boolean(credentialsFile || credentialsBase64);
  return {
    enabled,
    siteUrl,
    credentialsFile,
    credentialsBase64,
    rowLimit: integerValue(environment.GSC_ROW_LIMIT, 25_000, 100, 25_000),
    maxRows: integerValue(environment.GSC_MAX_ROWS, 100_000, 1_000, 500_000),
    searchType: ['web', 'image', 'video', 'news', 'discover', 'googleNews'].includes(String(environment.GSC_SEARCH_TYPE || 'web'))
      ? String(environment.GSC_SEARCH_TYPE || 'web')
      : 'web',
  };
}

async function credentials(config) {
  let parsed;
  try {
    const raw = config.credentialsFile
      ? await fs.readFile(config.credentialsFile, 'utf8')
      : Buffer.from(config.credentialsBase64, 'base64').toString('utf8');
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new SearchConsoleError(503, 'GSC_CREDENTIALS_INVALID', `Search Console credentials could not be loaded: ${error.message}`);
  }
  if (!parsed?.client_email || !parsed?.private_key) {
    throw new SearchConsoleError(503, 'GSC_CREDENTIALS_INCOMPLETE', 'Service account credentials must include client_email and private_key.');
  }
  return {
    clientEmail: String(parsed.client_email),
    privateKey: String(parsed.private_key).replace(/\\n/g, '\n'),
    tokenUri: String(parsed.token_uri || 'https://oauth2.googleapis.com/token'),
  };
}

async function accessToken(config) {
  const account = await credentials(config);
  const now = Math.floor(Date.now() / 1_000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64url(JSON.stringify({
    iss: account.clientEmail,
    scope: SCOPE,
    aud: account.tokenUri,
    iat: now,
    exp: now + 3_600,
  }));
  const unsigned = `${header}.${claim}`;
  let signature;
  try {
    signature = crypto.sign('RSA-SHA256', Buffer.from(unsigned), account.privateKey);
  } catch (error) {
    throw new SearchConsoleError(503, 'GSC_PRIVATE_KEY_INVALID', `The service account private key is invalid: ${error.message}`);
  }
  const assertion = `${unsigned}.${base64url(signature)}`;
  const response = await fetch(account.tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) {
    throw new SearchConsoleError(502, 'GSC_TOKEN_FAILED', body.error_description || body.error || `Google token endpoint returned ${response.status}.`);
  }
  return body.access_token;
}

function rowsFromResponse(rows) {
  return (rows || []).map((row) => {
    const [date = '', query = '', page = ''] = row.keys || [];
    return {
      date,
      query,
      page,
      clicks: Number(row.clicks) || 0,
      impressions: Number(row.impressions) || 0,
      position: Number(row.position) || 0,
    };
  }).filter((row) => safeDate(row.date) && (row.query || row.page));
}

export async function fetchSearchConsoleRows({ environment = process.env, from, to }) {
  const config = searchConsoleConfig(environment);
  if (!config.enabled) {
    throw new SearchConsoleError(503, 'GSC_NOT_CONFIGURED', 'Search Console synchronization is not configured.');
  }
  const startDate = safeDate(from);
  const endDate = safeDate(to);
  if (!startDate || !endDate || startDate > endDate) {
    throw new SearchConsoleError(400, 'GSC_INVALID_RANGE', 'Search Console dates must use YYYY-MM-DD and form a valid range.');
  }

  const token = await accessToken(config);
  const endpoint = `${API_ROOT}/${encodeURIComponent(config.siteUrl)}/searchAnalytics/query`;
  const allRows = [];
  let startRow = 0;
  while (allRows.length < config.maxRows) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        startDate,
        endDate,
        dimensions: ['date', 'query', 'page'],
        type: config.searchType,
        dataState: 'final',
        rowLimit: Math.min(config.rowLimit, config.maxRows - allRows.length),
        startRow,
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = body.error?.message || `Search Console API returned ${response.status}.`;
      throw new SearchConsoleError(response.status === 403 ? 403 : 502, 'GSC_QUERY_FAILED', message);
    }
    const pageRows = rowsFromResponse(body.rows);
    allRows.push(...pageRows);
    if (!body.rows?.length || body.rows.length < Math.min(config.rowLimit, config.maxRows - startRow)) break;
    startRow += body.rows.length;
  }
  return {
    siteUrl: config.siteUrl,
    from: startDate,
    to: endDate,
    rows: allRows,
    truncated: allRows.length >= config.maxRows,
    dataState: 'final',
  };
}

export async function syncSearchConsole({ environment = process.env, from, to, importRows }) {
  const result = await fetchSearchConsoleRows({ environment, from, to });
  const imported = result.rows.length ? await importRows(result.rows, result.to) : 0;
  return { ...result, imported, syncedAt: new Date().toISOString() };
}
