/**
 * Export helpers for the GUI.
 *   • SVG  → serialized client-side (instant, exact)
 *   • PNG/JPG/WEBP/PDF → rendered server-side through the same headless pipeline
 *     as the CLI (crisp, hi-DPI, vector PDF). PNG has a client-side fallback.
 *   • Copy → SVG markup or a raster image to the clipboard.
 */

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function serializeSvg(svgEl) {
  const clone = svgEl.cloneNode(true);
  if (!clone.getAttribute('xmlns')) clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(clone);
}

export function downloadSvg(svgEl, filename = 'diagram.svg') {
  triggerDownload(new Blob([serializeSvg(svgEl)], { type: 'image/svg+xml;charset=utf-8' }), filename);
}

export async function copySvgText(svgEl) {
  await navigator.clipboard.writeText(serializeSvg(svgEl));
}

/** Server-side render → Blob. `opts` is forwarded verbatim to /api/render. */
export async function serverRender(opts) {
  const res = await fetch('/api/render', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(opts),
  });
  if (!res.ok) {
    let msg = `Server render failed (${res.status})`;
    try {
      const j = await res.json();
      if (j.error) msg = j.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.blob();
}

/** Best-effort, fully client-side PNG (fallback only). */
export function clientPng(svgEl, { scale = 2, background = 'transparent' } = {}) {
  return new Promise((resolve, reject) => {
    const rect = svgEl.getBoundingClientRect();
    const w = Math.max(1, Math.round((rect.width || 800) * scale));
    const h = Math.max(1, Math.round((rect.height || 600) * scale));
    const blob = new Blob([serializeSvg(svgEl)], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (background && background !== 'transparent') {
          ctx.fillStyle = background;
          ctx.fillRect(0, 0, w, h);
        }
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob((b) => {
          URL.revokeObjectURL(url);
          b ? resolve(b) : reject(new Error('Canvas export failed.'));
        }, 'image/png');
      } catch (e) {
        URL.revokeObjectURL(url);
        reject(e);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not rasterize the SVG in-browser.'));
    };
    img.src = url;
  });
}

/**
 * Produce a Blob for any format. SVG is built client-side; everything else via
 * the server (with a PNG client-side fallback).
 */
export async function renderBlob({ format, svgEl, ...opts }) {
  if (format === 'svg') {
    return new Blob([serializeSvg(svgEl)], { type: 'image/svg+xml;charset=utf-8' });
  }
  try {
    return await serverRender({ format, ...opts });
  } catch (err) {
    if (format === 'png' && svgEl) return clientPng(svgEl, opts);
    throw err;
  }
}

export async function downloadAs(params) {
  const { format } = params;
  const blob = await renderBlob(params);
  triggerDownload(blob, params.filename || `diagram.${format === 'jpg' ? 'jpg' : format}`);
}

/** Copy a rendered raster image to the clipboard (PNG only — Clipboard API). */
export async function copyImage(params) {
  const blob = await renderBlob({ ...params, format: 'png' });
  if (!window.ClipboardItem) throw new Error('Clipboard image copy is not supported in this browser.');
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}

export { triggerDownload };
