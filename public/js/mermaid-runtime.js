/**
 * Shared Mermaid runtime. Imported by BOTH the live GUI and the headless page
 * Puppeteer drives, so the browser preview and the exported files come from the
 * exact same Mermaid build and configuration.
 *
 * Capabilities wired here:
 *   • full config (theme, themeVariables, per-diagram config)
 *   • icon packs (logos / mdi / fa6) — lazily fetched on first use
 *   • ELK layout — lazily imported only when requested
 *   • KaTeX math — bundled in Mermaid; CSS is loaded by the host page
 *   • custom CSS injected into the produced SVG
 */

import mermaid from '/vendor/mermaid/mermaid.esm.min.mjs';

let counter = 0;
let iconPacksRegistered = false;
let elkRegistered = false;

export const ICON_PACKS = ['logos', 'mdi', 'fa6-solid', 'fa6-brands'];

const BASE_CONFIG = {
  startOnLoad: false,
  securityLevel: 'loose',
  fontFamily:
    'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
};

/** Register all icon packs with lazy loaders (the JSON is only fetched when a
 *  diagram actually references that pack, e.g. `logos:aws`). */
export function registerIconPacks() {
  if (iconPacksRegistered) return;
  iconPacksRegistered = true;
  try {
    mermaid.registerIconPacks(
      ICON_PACKS.map((name) => ({
        name,
        loader: () => fetch(`/vendor/iconify/${name}/icons.json`).then((r) => r.json()),
      }))
    );
  } catch (err) {
    console.warn('icon pack registration failed:', err);
  }
}

/** Import + register the ELK layout engine (≈1.5 MB) only when needed. */
export async function registerElk() {
  if (elkRegistered) return;
  const mod = await import('/vendor-build/layout-elk.mjs');
  mermaid.registerLayoutLoaders(mod.default);
  elkRegistered = true;
}

function wantsElk(config, layout) {
  return layout === 'elk' || config?.layout === 'elk';
}

/** Insert a custom <style> block into a rendered SVG string. */
function injectCss(svg, css) {
  if (!css || !css.trim()) return svg;
  const styleTag = `<style>${css}</style>`;
  return svg.replace(/(<svg\b[^>]*>)/, `$1${styleTag}`);
}

/**
 * Render Mermaid source to an SVG string.
 * @param {string} code
 * @param {object} [opts]
 * @param {string} [opts.theme]
 * @param {object} [opts.config]  full mermaid config (themeVariables, flowchart{}, layout, …)
 * @param {string} [opts.layout]  shortcut for config.layout ('elk' | 'dagre')
 * @param {string} [opts.css]     extra CSS injected into the SVG
 */
export async function renderToSvg(code, { theme = 'default', config = {}, layout, css } = {}) {
  registerIconPacks();
  if (wantsElk(config, layout)) {
    try {
      await registerElk();
    } catch (err) {
      console.warn('ELK layout unavailable, falling back to default:', err);
    }
  }
  const merged = { ...BASE_CONFIG, theme, ...config };
  if (layout) merged.layout = layout;
  mermaid.initialize(merged);
  const id = `mstudio-${++counter}`;
  const { svg } = await mermaid.render(id, code);
  return injectCss(svg, css);
}

/** Validate without rendering. Returns {valid, message?, line?}. */
export async function validate(code, { theme = 'default' } = {}) {
  try {
    mermaid.initialize({ ...BASE_CONFIG, theme });
    await mermaid.parse(code);
    return { valid: true };
  } catch (err) {
    const message = err?.message || String(err);
    const m = /line (\d+)/i.exec(message);
    return { valid: false, message, line: m ? Number(m[1]) : null };
  }
}

/** Best-effort detection of the diagram type from the source's first keyword. */
export function detectType(code) {
  const firstLine = (code || '')
    .split('\n')
    .map((l) => l.replace(/%%.*$/, '').trim())
    .find((l) => l.length > 0);
  if (!firstLine) return 'unknown';
  const map = [
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
  for (const [re, name] of map) if (re.test(firstLine)) return name;
  return 'unknown';
}

export { mermaid };
