#!/usr/bin/env python3
from pathlib import Path

path = Path('src/server/app.js')
source = path.read_text(encoding='utf-8')

if "import crypto from 'node:crypto';" not in source:
    needle = "import { createRequire } from 'node:module';\n"
    if needle not in source:
        raise SystemExit('createRequire import not found')
    source = source.replace(needle, needle + "import crypto from 'node:crypto';\n", 1)

old_send_html = """function sendHtml(res, filePath) {
  const html = fs.readFileSync(filePath, 'utf8').split('%V%').join(BUILD);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.send(html);
}
"""
new_send_html = r"""function inlineScriptHashes(html) {
  const hashes = [];
  const pattern = /<script\b(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = pattern.exec(html))) {
    const body = match[1];
    if (!body.trim()) continue;
    hashes.push(`'sha256-${crypto.createHash('sha256').update(body).digest('base64')}'`);
  }
  return hashes;
}

function sendHtml(res, filePath) {
  const html = fs.readFileSync(filePath, 'utf8').split('%V%').join(BUILD);
  const hashes = inlineScriptHashes(html);
  if (hashes.length) {
    res.setHeader('Content-Security-Policy', contentSecurityPolicy(res.req, hashes));
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.send(html);
}
"""
if old_send_html in source:
    source = source.replace(old_send_html, new_send_html, 1)
elif 'function inlineScriptHashes(html)' not in source:
    raise SystemExit('sendHtml function did not match')

source = source.replace(
    'function contentSecurityPolicy(req) {',
    'function contentSecurityPolicy(req, inlineHashes = []) {',
    1,
)
source = source.replace(
    "    `script-src 'self'${external}`,",
    "    `script-src 'self'${external}${inlineHashes.length ? ` ${inlineHashes.join(' ')}` : ''}`,",
    1,
)

if 'function contentSecurityPolicy(req, inlineHashes = [])' not in source:
    raise SystemExit('CSP function signature was not updated')
if "inlineHashes.join(' ')" not in source:
    raise SystemExit('inline CSP hashes were not added')
path.write_text(source, encoding='utf-8')

svg_path = Path('public/js/svg-safety.js')
svg_source = svg_path.read_text(encoding='utf-8')
old_parser = """  const parsed = new DOMParser().parseFromString(source, 'image/svg+xml');
  if (parsed.querySelector('parsererror')) {
    throw new Error('SVG_PARSE_ERROR');
  }

  const svg = parsed.documentElement;
"""
new_parser = """  const parsed = new DOMParser().parseFromString(source, 'image/svg+xml');
  let svg = parsed.documentElement;

  // Mermaid diagram types such as C4 may embed XHTML labels that are valid in
  // browsers but rejected by the strict XML parser (for example HTML entities).
  // DOMParser's HTML mode does not execute scripts; we still extract only the
  // SVG root and run the full element, attribute, URL and CSS sanitizer below.
  if (parsed.querySelector('parsererror')) {
    const htmlDocument = new DOMParser().parseFromString(source, 'text/html');
    svg = htmlDocument.querySelector('svg');
  }

"""
if old_parser in svg_source:
    svg_source = svg_source.replace(old_parser, new_parser, 1)
elif "htmlDocument.querySelector('svg')" not in svg_source:
    raise SystemExit('SVG parser block did not match')
svg_path.write_text(svg_source, encoding='utf-8')

ci_path = Path('.github/workflows/ci.yml')
ci = ci_path.read_text(encoding='utf-8')
if 'PUPPETEER_NO_SANDBOX: true' not in ci:
    marker = "permissions:\n  contents: read\n\njobs:\n"
    replacement = "permissions:\n  contents: read\n\nenv:\n  PUPPETEER_NO_SANDBOX: true\n\njobs:\n"
    if marker not in ci:
        raise SystemExit('CI permissions block did not match')
    ci = ci.replace(marker, replacement, 1)
ci_path.write_text(ci, encoding='utf-8')

print('CSP hashes, safe C4 SVG fallback and CI Chromium compatibility enabled.')
