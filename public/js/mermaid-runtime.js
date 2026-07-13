/**
 * Shared Mermaid runtime used by both the live editor and the headless page.
 * Public/shared diagrams are always rendered in Mermaid's strict security mode.
 */

import mermaid from '/vendor/mermaid/mermaid.esm.min.mjs';
import { sanitizeCssText } from '/js/svg-safety.js';

let counter = 0;
let iconPacksRegistered = false;
let elkRegistered = false;

export const ICON_PACKS = ['logos', 'mdi', 'fa6-solid', 'fa6-brands'];

const BASE_CONFIG = Object.freeze({
  startOnLoad: false,
  securityLevel: 'strict',
  fontFamily:
    'Vazirmatn, Tahoma, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
});

export function registerIconPacks() {
  if (iconPacksRegistered) return;
  iconPacksRegistered = true;

  try {
    mermaid.registerIconPacks(
      ICON_PACKS.map((name) => ({
        name,
        loader: async () => {
          const response = await fetch(`/vendor/iconify/${name}/icons.json`);
          if (!response.ok) throw new Error(`Could not load icon pack ${name}`);
          return response.json();
        },
      }))
    );
  } catch (error) {
    console.warn('Icon pack registration failed:', error);
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

function safeConfig(config, theme, layout) {
  const userConfig = config && typeof config === 'object' && !Array.isArray(config) ? { ...config } : {};
  delete userConfig.securityLevel;
  delete userConfig.startOnLoad;
  delete userConfig.secure;
  if (typeof userConfig.themeCSS === 'string') {
    userConfig.themeCSS = sanitizeCssText(userConfig.themeCSS);
  }

  return {
    ...BASE_CONFIG,
    ...userConfig,
    theme,
    ...(layout ? { layout } : {}),
    // Keep these last so a shared URL/config can never opt into loose HTML.
    startOnLoad: false,
    securityLevel: 'strict',
  };
}

function injectCss(svgText, css) {
  const cleanCss = sanitizeCssText(css);
  if (!cleanCss.trim()) return svgText;

  const documentNode = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  if (documentNode.querySelector('parsererror') || documentNode.documentElement.localName !== 'svg') {
    throw new Error('Could not apply custom CSS to an invalid SVG');
  }

  const style = documentNode.createElementNS('http://www.w3.org/2000/svg', 'style');
  style.textContent = cleanCss;
  documentNode.documentElement.prepend(style);
  return new XMLSerializer().serializeToString(documentNode.documentElement);
}

export async function renderToSvg(code, { theme = 'default', config = {}, layout, css = '' } = {}) {
  registerIconPacks();

  if (wantsElk(config, layout)) {
    try {
      await registerElk();
    } catch (error) {
      console.warn('ELK layout unavailable; falling back to the default layout:', error);
    }
  }

  const merged = safeConfig(config, theme, layout);
  mermaid.initialize(merged);
  const id = `mstudio-${Date.now().toString(36)}-${++counter}`;
  const { svg } = await mermaid.render(id, String(code || ''));
  return injectCss(svg, css);
}

export async function validate(code, { theme = 'default' } = {}) {
  try {
    mermaid.initialize(safeConfig({}, theme));
    await mermaid.parse(String(code || ''));
    return { valid: true };
  } catch (error) {
    const message = error?.message || String(error);
    const lineMatch = /line\s+(\d+)/i.exec(message);
    return {
      valid: false,
      message,
      line: lineMatch ? Number(lineMatch[1]) : null,
    };
  }
}

export function detectType(code) {
  const firstLine = String(code || '')
    .split('\n')
    .map((line) => line.replace(/%%.*$/, '').trim())
    .find(Boolean);

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
