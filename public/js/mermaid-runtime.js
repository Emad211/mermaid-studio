/**
 * Shared Mermaid runtime used by both the live editor and the headless exporter.
 * Safe mode is the default. Unsafe Mermaid HTML/click features can only be enabled
 * explicitly by the server through MSTUDIO_ALLOW_UNSAFE_MERMAID=1.
 */

import mermaid from '/vendor/mermaid/mermaid.esm.min.mjs';

let counter = 0;
let iconPacksRegistered = false;
let elkRegistered = false;
let capabilitiesPromise = null;

export const ICON_PACKS = ['logos', 'mdi', 'fa6-solid', 'fa6-brands'];

const BASE_CONFIG = {
  startOnLoad: false,
  securityLevel: 'strict',
  fontFamily:
    'Vazirmatn, Tahoma, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
};

function loadCapabilities() {
  if (!capabilitiesPromise) {
    capabilitiesPromise = fetch('/api/meta', { credentials: 'same-origin' })
      .then((response) => (response.ok ? response.json() : null))
      .then((meta) => ({ allowUnsafeMermaid: meta?.allowUnsafeMermaid === true }))
      .catch(() => ({ allowUnsafeMermaid: false }));
  }
  return capabilitiesPromise;
}

function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function safeConfig(config, allowUnsafe) {
  const source = plainObject(config);
  const result = { ...source };

  delete result.__proto__;
  delete result.prototype;
  delete result.constructor;

  if (allowUnsafe) {
    if (!result.securityLevel) result.securityLevel = 'loose';
  } else {
    result.securityLevel = 'strict';
    if (result.themeCSS) result.themeCSS = safeCss(result.themeCSS, false);
  }

  return result;
}

function safeCss(css, allowUnsafe) {
  const value = String(css || '').trim();
  if (!value) return '';

  if (!allowUnsafe) {
    const blocked = /(?:@import\b|url\s*\(|expression\s*\(|behavior\s*:|<|>)/i;
    if (blocked.test(value)) {
      throw new Error('در حالت امن، @import، url() و کد HTML داخل CSS مجاز نیست.');
    }
  }

  // Never allow a custom value to terminate the generated style element.
  return value.replace(/<\/style/gi, '<\\/style');
}

export function registerIconPacks() {
  if (iconPacksRegistered) return;
  iconPacksRegistered = true;
  try {
    mermaid.registerIconPacks(
      ICON_PACKS.map((name) => ({
        name,
        loader: () => fetch(`/vendor/iconify/${name}/icons.json`).then((response) => {
          if (!response.ok) throw new Error(`Icon pack ${name} could not be loaded.`);
          return response.json();
        }),
      })),
    );
  } catch (error) {
    console.warn('icon pack registration failed:', error);
  }
}

export async function registerElk() {
  if (elkRegistered) return;
  const module = await import('/vendor-build/layout-elk.mjs');
  mermaid.registerLayoutLoaders(module.default);
  elkRegistered = true;
}

function wantsElk(config, layout) {
  return layout === 'elk' || config?.layout === 'elk';
}

function injectCss(svg, css) {
  if (!css) return svg;
  return svg.replace(/(<svg\b[^>]*>)/, `$1<style>${css}</style>`);
}

/**
 * Render Mermaid source into an SVG string.
 *
 * @param {string} code
 * @param {object} [options]
 * @param {string} [options.theme]
 * @param {object} [options.config]
 * @param {string} [options.layout]
 * @param {string} [options.css]
 * @param {boolean} [options.allowUnsafe]
 */
export async function renderToSvg(
  code,
  { theme = 'default', config = {}, layout, css, allowUnsafe } = {},
) {
  registerIconPacks();

  const capabilities = allowUnsafe === undefined ? await loadCapabilities() : null;
  const unsafeAllowed = allowUnsafe === true || capabilities?.allowUnsafeMermaid === true;
  const normalizedConfig = safeConfig(config, unsafeAllowed);
  const normalizedCss = safeCss(css, unsafeAllowed);

  if (wantsElk(normalizedConfig, layout)) {
    try {
      await registerElk();
    } catch (error) {
      console.warn('ELK layout unavailable, falling back to default:', error);
    }
  }

  const merged = { ...BASE_CONFIG, theme, ...normalizedConfig };
  if (layout) merged.layout = layout;
  if (!unsafeAllowed) merged.securityLevel = 'strict';

  mermaid.initialize(merged);
  const id = `mstudio-${++counter}`;
  const { svg } = await mermaid.render(id, String(code || ''));
  return injectCss(svg, normalizedCss);
}

export async function validate(code, { theme = 'default' } = {}) {
  try {
    mermaid.initialize({ ...BASE_CONFIG, theme, securityLevel: 'strict' });
    await mermaid.parse(String(code || ''));
    return { valid: true };
  } catch (error) {
    const message = error?.message || String(error);
    const match = /line (\d+)/i.exec(message);
    return { valid: false, message, line: match ? Number(match[1]) : null };
  }
}

export function detectType(code) {
  const firstLine = String(code || '')
    .split('\n')
    .map((line) => line.replace(/%%.*$/, '').trim())
    .find((line) => line.length > 0);
  if (!firstLine) return 'unknown';

  const types = [
    [/^(flowchart|graph)\b/i, 'flowchart'],
    [/^sequenceDiagram\b/i, 'sequence'],
    [/^classDiagram\b/i, 'class'],
    [/^stateDiagram(-v2)?\b/i, 'state'],
    [/^erDiagram\b/i, 'entity-relationship'],
    [/^journey\b/i, 'user journey'],
    [/^gantt\b/i, 'gantt'],
    [/^pie\b/i, 'pie'],
    [/^quadrantChart\b/i, 'quadrant'],
    [/^requirementDiagram\b/i, 'requirement'],
    [/^gitGraph\b/i, 'git graph'],
    [/^(C4Context|C4Container|C4Component|C4Dynamic|C4Deployment)\b/i, 'C4'],
    [/^mindmap\b/i, 'mindmap'],
    [/^timeline\b/i, 'timeline'],
    [/^sankey(-beta)?\b/i, 'sankey'],
    [/^xychart(-beta)?\b/i, 'xy chart'],
    [/^block(-beta)?\b/i, 'block'],
    [/^packet(-beta)?\b/i, 'packet'],
    [/^kanban\b/i, 'kanban'],
    [/^architecture(-beta)?\b/i, 'architecture'],
    [/^radar(-beta)?\b/i, 'radar'],
    [/^zenuml\b/i, 'zenuml'],
  ];

  for (const [pattern, name] of types) {
    if (pattern.test(firstLine)) return name;
  }
  return 'unknown';
}

export { mermaid };
