import crypto from 'node:crypto';

const LEGACY_COOKIE_NAME = 'nemodara_editor_ads_bucket';
const SECURE_COOKIE_NAME = '__Host-nemodara_editor_ads_bucket';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const DEFAULT_TOKEN_TTL_SECONDS = 300;

function parseCookies(header) {
  const values = {};
  for (const part of String(header || '').split(';')) {
    const index = part.indexOf('=');
    if (index <= 0) continue;
    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!name || Object.prototype.hasOwnProperty.call(values, name)) continue;
    try {
      values[name] = decodeURIComponent(value);
    } catch {
      values[name] = value;
    }
  }
  return values;
}

function validBucket(value) {
  const bucket = Number(value);
  return Number.isInteger(bucket) && bucket >= 0 && bucket < 100 ? bucket : null;
}

function isProduction(environment) {
  return String(environment.NODE_ENV || '').toLowerCase() === 'production';
}

function cookieName(environment) {
  return isProduction(environment) ? SECURE_COOKIE_NAME : LEGACY_COOKIE_NAME;
}

function serializeCookie(bucket, environment, secureRequest) {
  const secure = isProduction(environment) || secureRequest;
  const attributes = [
    `${cookieName(environment)}=${bucket}`,
    'Path=/',
    `Max-Age=${MAX_AGE_SECONDS}`,
    'HttpOnly',
    'SameSite=Lax',
    'Priority=Low',
  ];
  if (secure) attributes.push('Secure');
  return attributes.join('; ');
}

function safeOrigin(value) {
  try {
    const url = new URL(String(value || '').trim());
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return '';
    return url.origin;
  } catch {
    return '';
  }
}

function tokenSecret(environment) {
  const value = String(environment.ADS_EDITOR_TOKEN_SECRET || environment.ANALYTICS_HASH_SECRET || '');
  return value.length >= 32 ? value : '';
}

function ttlSeconds(environment) {
  const value = Number(environment.ADS_EDITOR_TOKEN_TTL_SECONDS);
  if (!Number.isFinite(value)) return DEFAULT_TOKEN_TTL_SECONDS;
  return Math.min(1_800, Math.max(60, Math.round(value)));
}

function encode(value) {
  return Buffer.from(value).toString('base64url');
}

function sign(encodedPayload, secret) {
  return crypto.createHmac('sha256', secret).update(encodedPayload).digest('base64url');
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function editorAdTokenReady(environment = process.env) {
  return Boolean(
    tokenSecret(environment)
    && safeOrigin(environment.SITE_URL)
    && safeOrigin(environment.ADS_EDITOR_FRAME_ORIGIN),
  );
}

export function createEditorAdFrameToken(slot, environment = process.env, nowMs = Date.now()) {
  const secret = tokenSecret(environment);
  const siteOrigin = safeOrigin(environment.SITE_URL);
  const frameOrigin = safeOrigin(environment.ADS_EDITOR_FRAME_ORIGIN);
  if (!secret || !siteOrigin || !frameOrigin || !['editorRail', 'editorDock'].includes(String(slot))) return '';
  const payload = {
    v: 1,
    slot: String(slot),
    iss: siteOrigin,
    aud: frameOrigin,
    exp: Math.floor(nowMs / 1_000) + ttlSeconds(environment),
  };
  const encoded = encode(JSON.stringify(payload));
  return `${encoded}.${sign(encoded, secret)}`;
}

export function verifyEditorAdFrameToken(token, slot, environment = process.env, nowMs = Date.now()) {
  const secret = tokenSecret(environment);
  if (!secret || typeof token !== 'string') return false;
  const [encoded, signature, extra] = token.split('.');
  if (!encoded || !signature || extra || !safeEqual(signature, sign(encoded, secret))) return false;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    return payload?.v === 1
      && payload.slot === String(slot)
      && payload.iss === safeOrigin(environment.SITE_URL)
      && payload.aud === safeOrigin(environment.ADS_EDITOR_FRAME_ORIGIN)
      && Number.isInteger(payload.exp)
      && payload.exp >= Math.floor(nowMs / 1_000);
  } catch {
    return false;
  }
}

/**
 * Assigns a stable, opaque bucket used only to decide whether the editor ad
 * shell is present in the initial HTML. The value carries no user data and is
 * never sent to publisher scripts.
 */
export function editorAdRollout(req, res, advertising, environment = process.env) {
  const percent = Math.min(100, Math.max(0, Number(advertising?.editor?.trafficPercent) || 0));
  if (!advertising?.editor?.enabled || percent <= 0) {
    return { eligible: false, bucket: null, percent };
  }

  const cookies = parseCookies(req.get?.('Cookie') || req.headers?.cookie);
  const preferredName = cookieName(environment);
  let bucket = validBucket(cookies[preferredName]);
  if (bucket === null && !isProduction(environment)) bucket = validBucket(cookies[SECURE_COOKIE_NAME]);
  if (bucket === null && isProduction(environment)) bucket = validBucket(cookies[LEGACY_COOKIE_NAME]);

  let assigned = false;
  if (bucket === null) {
    bucket = crypto.randomInt(0, 100);
    assigned = true;
    res.append('Set-Cookie', serializeCookie(bucket, environment, req.secure === true));
  }

  return {
    eligible: bucket < percent,
    bucket,
    percent,
    assigned,
  };
}

export {
  LEGACY_COOKIE_NAME as EDITOR_AD_ROLLOUT_COOKIE,
  SECURE_COOKIE_NAME as EDITOR_AD_ROLLOUT_SECURE_COOKIE,
  MAX_AGE_SECONDS as EDITOR_AD_ROLLOUT_MAX_AGE,
};
