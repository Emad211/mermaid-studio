import crypto from 'node:crypto';

const COOKIE_NAME = 'nemodara_editor_ads_bucket';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

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

function serializeCookie(bucket, secure) {
  const attributes = [
    `${COOKIE_NAME}=${bucket}`,
    'Path=/',
    `Max-Age=${MAX_AGE_SECONDS}`,
    'HttpOnly',
    'SameSite=Lax',
    'Priority=Low',
  ];
  if (secure) attributes.push('Secure');
  return attributes.join('; ');
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
  let bucket = validBucket(cookies[COOKIE_NAME]);
  let assigned = false;
  if (bucket === null) {
    bucket = crypto.randomInt(0, 100);
    assigned = true;
    const secure = environment.NODE_ENV === 'production' || req.secure === true;
    res.append('Set-Cookie', serializeCookie(bucket, secure));
  }

  return {
    eligible: bucket < percent,
    bucket,
    percent,
    assigned,
  };
}

export { COOKIE_NAME as EDITOR_AD_ROLLOUT_COOKIE, MAX_AGE_SECONDS as EDITOR_AD_ROLLOUT_MAX_AGE };
