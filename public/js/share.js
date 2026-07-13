/** Shareable-link encoding: deflate + base64url the editor state into the URL hash. */

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
  const json = JSON.stringify(state);
  if (window.pako) return 'p:' + bytesToBase64Url(window.pako.deflate(json));
  // fallback: plain (UTF-8 safe) base64url
  return 'u:' + bytesToBase64Url(new TextEncoder().encode(json));
}

export function decodeState(token) {
  if (!token) return null;
  try {
    const mode = token.slice(0, 2);
    const body = token.slice(2);
    const bytes = base64UrlToBytes(body);
    let json;
    if (mode === 'p:') json = window.pako.inflate(bytes, { to: 'string' });
    else if (mode === 'u:') json = new TextDecoder().decode(bytes);
    else return null;
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function readHashState() {
  const h = location.hash.replace(/^#/, '');
  if (!h.startsWith('code=')) return null;
  return decodeState(decodeURIComponent(h.slice('code='.length)));
}

export function buildShareUrl(state) {
  const token = encodeURIComponent(encodeState(state));
  return `${location.origin}${location.pathname}#code=${token}`;
}
