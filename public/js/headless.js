import { renderToSvg, validate } from '/js/mermaid-runtime.js';
import { mountSafeSvg } from '/js/svg-safety.js';

window.__validate = async ({ code, theme }) => validate(code, { theme });

function applySize(svg, width, height) {
  const parts = (svg.getAttribute('viewBox') || '')
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  const viewBoxWidth = parts[2] || svg.clientWidth || 100;
  const viewBoxHeight = parts[3] || svg.clientHeight || 100;
  let targetWidth = Number(width) || null;
  let targetHeight = Number(height) || null;

  if (targetWidth && !targetHeight) targetHeight = (targetWidth * viewBoxHeight) / viewBoxWidth;
  else if (targetHeight && !targetWidth) targetWidth = (targetHeight * viewBoxWidth) / viewBoxHeight;
  else if (!targetWidth && !targetHeight) {
    targetWidth = viewBoxWidth;
    targetHeight = viewBoxHeight;
  }

  svg.setAttribute('width', String(Math.max(1, Math.round(targetWidth))));
  svg.setAttribute('height', String(Math.max(1, Math.round(targetHeight))));
  svg.style.maxWidth = 'none';
}

window.__render = async ({ code, theme, background, width, height, config, layout, css }) => {
  try {
    const svgText = await renderToSvg(code, { theme, config, layout, css });
    const container = document.querySelector('#container');
    const svg = mountSafeSvg(container, svgText);
    const safeBackground = background || 'transparent';
    document.body.style.background = safeBackground;
    container.style.background = safeBackground;
    applySize(svg, width, height);
    const rect = svg.getBoundingClientRect();
    return {
      svg: new XMLSerializer().serializeToString(svg),
      width: rect.width,
      height: rect.height,
    };
  } catch (error) {
    return { error: error?.message || String(error) };
  }
};

window.__mermaidReady = true;
