/**
 * Defensive SVG mounting for shared/public diagrams.
 * Mermaid runs in strict mode as the primary protection. This module adds a
 * second boundary before generated markup enters the application document.
 */

const MAX_SVG_CHARS = 2_000_000;
const MAX_NODES = 50_000;
const FORBIDDEN_ELEMENTS = 'script,iframe,object,embed,audio,video,canvas,link,meta,base,form,input,button,textarea,select,animate,animateMotion,animateTransform,set';
const URL_ATTRIBUTES = new Set(['href', 'xlink:href', 'src']);

function isSafeReference(value) {
  const normalized = String(value || '').trim().replace(/[\u0000-\u001f\u007f]/g, '');
  if (!normalized) return true;
  if (normalized.startsWith('#')) return true;
  if (/^data:image\/(?:png|gif|jpe?g|webp);base64,/i.test(normalized)) return true;
  return false;
}

function sanitizeCssText(css) {
  return String(css || '')
    .replace(/@import[\s\S]*?(?:;|$)/gi, '')
    .replace(/expression\s*\([^)]*\)/gi, '')
    .replace(/-moz-binding\s*:[^;]+;?/gi, '')
    .replace(/:host(?:-context)?\s*\([^)]*\)|:host|::slotted\s*\([^)]*\)/gi, '')
    .replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (_match, _quote, target) => {
      const value = String(target || '').trim();
      return value.startsWith('#') ? `url(${value})` : 'none';
    })
    .replace(/javascript\s*:/gi, '');
}

function sanitizeElement(element) {
  for (const attribute of [...element.attributes]) {
    const name = attribute.name.toLowerCase();
    const value = attribute.value;

    if (name.startsWith('on')) {
      element.removeAttribute(attribute.name);
      continue;
    }

    if (URL_ATTRIBUTES.has(name) && !isSafeReference(value)) {
      element.removeAttribute(attribute.name);
      continue;
    }

    if (name === 'style' || /url\s*\(/i.test(value)) {
      const clean = sanitizeCssText(value);
      if (clean) element.setAttribute(attribute.name, clean);
      else element.removeAttribute(attribute.name);
    }
  }

  if (element.localName === 'style') {
    element.textContent = sanitizeCssText(element.textContent);
  }
}

/**
 * Mermaid's C4 renderer currently emits xlink:href in image elements without
 * declaring the xlink namespace on the root SVG. Browsers accept that markup
 * when inserted as HTML, but an XML DOMParser correctly rejects it. Add only
 * the missing standard namespace before strict XML parsing so the sanitizer
 * can keep using the safer XML parser for every diagram type.
 */
function normalizeSvgNamespaces(source) {
  const openingTag = source.match(/^\s*<svg\b[^>]*>/i)?.[0] || '';
  if (!openingTag) return source;
  if (/\bxlink:/.test(source) && !/\bxmlns:xlink\s*=/.test(openingTag)) {
    return source.replace(/<svg\b/i, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
  }
  return source;
}

/**
 * Parse and sanitize an SVG string. Returns a detached SVGElement.
 */
export function parseSafeSvg(svgText) {
  const source = String(svgText || '');
  if (!source || source.length > MAX_SVG_CHARS) {
    throw new Error('SVG_SIZE_LIMIT');
  }

  const normalizedSource = normalizeSvgNamespaces(source);
  const parsed = new DOMParser().parseFromString(normalizedSource, 'image/svg+xml');
  if (parsed.querySelector('parsererror')) {
    throw new Error('SVG_PARSE_ERROR');
  }

  const svg = parsed.documentElement;
  if (!svg || svg.localName !== 'svg' || svg.namespaceURI !== 'http://www.w3.org/2000/svg') {
    throw new Error('SVG_ROOT_INVALID');
  }

  svg.querySelectorAll(FORBIDDEN_ELEMENTS).forEach((node) => node.remove());

  const nodes = [svg, ...svg.querySelectorAll('*')];
  if (nodes.length > MAX_NODES) {
    throw new Error('SVG_NODE_LIMIT');
  }

  nodes.forEach(sanitizeElement);
  return document.importNode(svg, true);
}

/**
 * Mount a sanitized SVG inside a shadow root. Besides script/URL sanitisation,
 * this prevents diagram CSS from restyling the surrounding application page.
 */
export function mountSafeSvg(stage, svgText) {
  const svg = parseSafeSvg(svgText);
  svg.style.display = 'block';
  const root = stage.shadowRoot || stage.attachShadow({ mode: 'open' });
  root.replaceChildren(svg);
  return svg;
}

export { sanitizeCssText };
