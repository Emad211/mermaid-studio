/** Shareable-link encoding: deflate + base64url the editor state into the URL hash. */

const MAX_TOKEN_CHARS = 500_000;
const MAX_JSON_CHARS = 220_000;
const MAX_CODE_CHARS = 100_000;
const MAX_SETTING_CHARS = 50_000;
const THEMES = new Set(['default', 'neutral', 'dark', 'forest', 'base']);
const LAYOUTS = new Set(['dagre', 'elk']);
const APP_THEMES = new Set(['light', 'dark']);

function bytesToBase64Url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const bin = atob(str);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function encodeState(state) {
  const normalized = normalizeState(state);
  if (!normalized) throw new Error('محتوای نمودار برای اشتراک‌گذاری معتبر نیست.');
  const json = JSON.stringify(normalized);
  if (json.length > MAX_JSON_CHARS) throw new Error('حجم نمودار برای ساخت لینک اشتراک‌گذاری بیش از حد بزرگ است.');
  if (window.pako) return 'p:' + bytesToBase64Url(window.pako.deflate(json));
  // fallback: plain (UTF-8 safe) base64url
  return 'u:' + bytesToBase64Url(new TextEncoder().encode(json));
}

function inflateBounded(bytes) {
  if (!window.pako?.Inflate) return null;
  const inflater = new window.pako.Inflate({ to: 'string', chunkSize: 16_384 });
  const chunks = [];
  let length = 0;
  inflater.onData = (chunk) => {
    length += chunk.length;
    if (length > MAX_JSON_CHARS) throw new Error('SHARE_STATE_TOO_LARGE');
    chunks.push(chunk);
  };
  inflater.push(bytes, true);
  if (inflater.err) throw new Error(inflater.msg || 'SHARE_STATE_INVALID');
  return chunks.join('');
}

function normalizeState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (typeof value.code !== 'string' || value.code.length > MAX_CODE_CHARS) return null;
  if (value.config != null && (typeof value.config !== 'string' || value.config.length > MAX_SETTING_CHARS)) return null;
  if (value.css != null && (typeof value.css !== 'string' || value.css.length > MAX_SETTING_CHARS)) return null;

  const background = typeof value.background === 'string' && /^(?:transparent|white|dark|#[0-9a-f]{3,8})$/i.test(value.background)
    ? value.background
    : 'white';
  const scale = Number(value.scale);
  return {
    code: value.code,
    theme: THEMES.has(value.theme) ? value.theme : 'default',
    layout: LAYOUTS.has(value.layout) ? value.layout : 'dagre',
    background,
    config: value.config || '',
    css: value.css || '',
    scale: Number.isFinite(scale) ? Math.min(5, Math.max(1, scale)) : 2,
    appTheme: APP_THEMES.has(value.appTheme) ? value.appTheme : undefined,
    autofit: typeof value.autofit === 'boolean' ? value.autofit : undefined,
    wrap: typeof value.wrap === 'boolean' ? value.wrap : undefined,
    fontSize: Number.isFinite(Number(value.fontSize)) ? Math.min(24, Math.max(10, Number(value.fontSize))) : undefined,
  };
}

export function decodeState(token) {
  if (!token || token.length > MAX_TOKEN_CHARS) return null;
  try {
    const mode = token.slice(0, 2);
    const body = token.slice(2);
    const bytes = base64UrlToBytes(body);
    let json;
    if (mode === 'p:') json = inflateBounded(bytes);
    else if (mode === 'u:') json = new TextDecoder().decode(bytes);
    else return null;
    if (!json || json.length > MAX_JSON_CHARS) return null;
    return normalizeState(JSON.parse(json));
  } catch {
    return null;
  }
}

export function readHashState() {
  const h = location.hash.replace(/^#/, '');
  if (!h.startsWith('code=')) return null;
  try {
    return decodeState(decodeURIComponent(h.slice('code='.length)));
  } catch {
    return null;
  }
}

export function buildShareUrl(state) {
  const token = encodeURIComponent(encodeState(state));
  return `${location.origin}${location.pathname}#code=${token}`;
}
