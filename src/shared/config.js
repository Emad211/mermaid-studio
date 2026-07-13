/**
 * Shared configuration: the single source of truth for themes, output formats,
 * background presets and rendering defaults. Used by both the CLI and the server.
 */

export const THEMES = ['default', 'neutral', 'dark', 'forest', 'base'];

/** Output formats the tool can produce. */
export const FORMATS = ['svg', 'png', 'jpg', 'jpeg', 'webp', 'pdf'];

/** Raster formats (need Chromium screenshotting). */
export const RASTER_FORMATS = ['png', 'jpg', 'jpeg', 'webp'];

/** PDF paper sizes ('auto' = size the page exactly to the diagram). */
export const PDF_PAPERS = ['auto', 'a3', 'a4', 'a5', 'letter', 'legal', 'tabloid'];

/** Mermaid layout engines. */
export const LAYOUTS = ['dagre', 'elk'];

/** Friendly background presets the GUI exposes as buttons. */
export const BACKGROUNDS = {
  transparent: 'transparent',
  white: '#ffffff',
  dark: '#1e1e2e',
};

/** Default rendering options shared by every entry point. */
export const DEFAULTS = {
  theme: 'default',
  background: 'white',
  scale: 2,
  quality: 92,
  width: 1200,
  height: 800,
  format: 'svg',
  layout: 'dagre',
  pdfPaper: 'auto',
};

/**
 * Resolve a background value (preset name OR raw CSS color) into a concrete CSS
 * color string. "transparent" is preserved verbatim.
 */
export function resolveBackground(value) {
  if (!value) return BACKGROUNDS[DEFAULTS.background];
  if (value in BACKGROUNDS) return BACKGROUNDS[value];
  return value;
}

/** Infer an output format from a file extension, falling back to the default. */
export function formatFromPath(outputPath, fallback = DEFAULTS.format) {
  if (!outputPath) return fallback;
  const m = /\.([a-z0-9]+)$/i.exec(outputPath);
  if (!m) return fallback;
  const ext = m[1].toLowerCase();
  return FORMATS.includes(ext) ? ext : fallback;
}

/** Map a (normalized) format to a MIME type. */
export function mimeFor(format) {
  switch (String(format).toLowerCase()) {
    case 'svg':
      return 'image/svg+xml';
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'pdf':
      return 'application/pdf';
    default:
      return 'application/octet-stream';
  }
}
