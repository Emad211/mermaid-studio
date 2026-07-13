/**
 * Export helpers for Mermaid Studio.
 *
 * Privacy-first defaults:
 *   • SVG is serialized in the browser.
 *   • PNG / JPG / WebP are rasterized in the browser first, so ordinary image
 *     exports do not need to leave the user's device.
 *   • PDF still uses the bounded server renderer because browsers do not expose
 *     a dependable vector-PDF export API.
 *
 * The server remains a best-effort fallback for raster formats when a browser
 * cannot complete the local conversion.
 */

const BACKGROUNDS = {
  transparent: 'transparent',
  white: '#ffffff',
  dark: '#1e1e2e',
};

const MAX_RASTER_PIXELS = 64_000_000;

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
  if (!svgEl) throw new Error('هیچ نموداری برای خروجی وجود ندارد.');
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

/** Server-side render → Blob. `opts` is forwarded to /api/render. */
export async function serverRender(opts) {
  const res = await fetch('/api/render', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(opts),
  });
  if (!res.ok) {
    let msg = `خروجی سرور ناموفق بود (${res.status})`;
    try {
      const body = await res.json();
      if (body.error) msg = body.error;
    } catch {
      /* response was not JSON */
    }
    throw new Error(msg);
  }
  return res.blob();
}

function svgNaturalSize(svgEl) {
  const viewBox = (svgEl.getAttribute('viewBox') || '')
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  const viewBoxWidth = viewBox.length === 4 && Number.isFinite(viewBox[2]) ? viewBox[2] : 0;
  const viewBoxHeight = viewBox.length === 4 && Number.isFinite(viewBox[3]) ? viewBox[3] : 0;
  const attrWidth = Number.parseFloat(svgEl.getAttribute('width'));
  const attrHeight = Number.parseFloat(svgEl.getAttribute('height'));
  const rect = svgEl.getBoundingClientRect();

  return {
    width: Math.max(1, viewBoxWidth || attrWidth || rect.width || 800),
    height: Math.max(1, viewBoxHeight || attrHeight || rect.height || 600),
  };
}

function rasterMime(format) {
  if (format === 'jpg' || format === 'jpeg') return 'image/jpeg';
  if (format === 'webp') return 'image/webp';
  return 'image/png';
}

function resolvedBackground(value, format) {
  const background = BACKGROUNDS[value] || value || 'transparent';
  if ((format === 'jpg' || format === 'jpeg') && background === 'transparent') return '#ffffff';
  return background;
}

/**
 * Fully client-side raster export. The SVG is loaded through an object URL and
 * painted onto a canvas. Output dimensions are based on the SVG viewBox rather
 * than the current editor zoom level.
 */
export function clientRaster(
  svgEl,
  { format = 'png', scale = 2, quality = 92, background = 'transparent' } = {},
) {
  return new Promise((resolve, reject) => {
    if (!svgEl) return reject(new Error('هیچ نموداری برای خروجی وجود ندارد.'));

    const safeScale = Math.min(5, Math.max(1, Number(scale) || 2));
    const natural = svgNaturalSize(svgEl);
    let width = Math.max(1, Math.round(natural.width * safeScale));
    let height = Math.max(1, Math.round(natural.height * safeScale));
    const pixels = width * height;

    if (pixels > MAX_RASTER_PIXELS) {
      const reduction = Math.sqrt(MAX_RASTER_PIXELS / pixels);
      width = Math.max(1, Math.floor(width * reduction));
      height = Math.max(1, Math.floor(height * reduction));
    }

    const blob = new Blob([serializeSvg(svgEl)], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();

    const cleanup = () => URL.revokeObjectURL(url);
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('مرورگر امکان ساخت تصویر را فراهم نکرد.');

        const fill = resolvedBackground(background, format);
        if (fill !== 'transparent') {
          ctx.fillStyle = fill;
          ctx.fillRect(0, 0, width, height);
        }
        ctx.drawImage(img, 0, 0, width, height);

        const mime = rasterMime(format);
        const normalizedQuality = Math.min(1, Math.max(0.01, (Number(quality) || 92) / 100));
        canvas.toBlob(
          (result) => {
            cleanup();
            result ? resolve(result) : reject(new Error('ساخت فایل تصویر ناموفق بود.'));
          },
          mime,
          normalizedQuality,
        );
      } catch (error) {
        cleanup();
        reject(error);
      }
    };
    img.onerror = () => {
      cleanup();
      reject(new Error('مرورگر نتوانست SVG را به تصویر تبدیل کند.'));
    };
    img.src = url;
  });
}

/** Backwards-compatible PNG helper used by older integrations. */
export function clientPng(svgEl, opts = {}) {
  return clientRaster(svgEl, { ...opts, format: 'png' });
}

/** Produce a Blob for any supported format. */
export async function renderBlob({ format, svgEl, forceServer = false, ...opts }) {
  const normalized = String(format || 'svg').toLowerCase();
  if (normalized === 'svg') {
    return new Blob([serializeSvg(svgEl)], { type: 'image/svg+xml;charset=utf-8' });
  }

  const raster = ['png', 'jpg', 'jpeg', 'webp'].includes(normalized);
  if (raster && svgEl && !forceServer) {
    try {
      return await clientRaster(svgEl, { ...opts, format: normalized });
    } catch (clientError) {
      try {
        return await serverRender({ format: normalized, ...opts });
      } catch {
        throw clientError;
      }
    }
  }

  return serverRender({ format: normalized, ...opts });
}

export async function downloadAs(params) {
  const format = String(params.format || 'svg').toLowerCase();
  const blob = await renderBlob(params);
  const extension = format === 'jpeg' ? 'jpg' : format;
  triggerDownload(blob, params.filename || `diagram.${extension}`);
}

/** Copy a rendered PNG image to the clipboard. */
export async function copyImage(params) {
  if (!window.ClipboardItem) throw new Error('مرورگر شما از کپی مستقیم تصویر پشتیبانی نمی‌کند.');
  const blob = await renderBlob({ ...params, format: 'png' });
  const png = blob.type === 'image/png' ? blob : new Blob([await blob.arrayBuffer()], { type: 'image/png' });
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
}

export { triggerDownload };
