/** Mermaid Studio — GUI controller. */

import { renderToSvg, detectType } from '/js/mermaid-runtime.js';
import { createEditor } from '/js/editor.js';
import { downloadSvg, downloadAs, copySvgText, copyImage } from '/js/exporter.js';
import { buildShareUrl, readHashState } from '/js/share.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

const STORE_KEY = 'mstudio:v2';
const FALLBACK_DIAGRAM = `flowchart TD
    A[Start] --> B{Is it working?}
    B -- Yes --> C[Ship it 🚀]
    B -- No --> D[Debug]
    D --> B`;

const BG_COLORS = { transparent: 'transparent', white: '#ffffff', dark: '#1e1e2e' };
const RASTER = ['png', 'jpg', 'webp'];
const LOSSY = ['jpg', 'webp'];

const state = {
  theme: 'default',
  layout: 'dagre',
  background: 'white',
  scale: 2,
  appTheme: 'dark',
  config: '',
  css: '',
  autofit: true,
  wrap: false,
  fontSize: 13.5,
};

let editor;
let currentSvgEl = null;
const view = { z: 1, tx: 0, ty: 0 };

/* --------------------------------------------------------------- storage */

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ code: editor.getValue(), ...state }));
  } catch {
    /* ignore quota */
  }
}
function load() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY)) || null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ toast */

let toastTimer = null;
function toast(msg, kind = 'info') {
  const el = $('#toast');
  el.textContent = msg;
  el.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = 'toast'), 2600);
}

/* --------------------------------------------------------------- config */

function parsedConfig() {
  const raw = state.config.trim();
  if (!raw) {
    $('#config-error').textContent = '';
    return {};
  }
  try {
    const obj = JSON.parse(raw);
    $('#config-error').textContent = '';
    return obj;
  } catch (e) {
    $('#config-error').textContent = 'Invalid JSON: ' + e.message;
    return {};
  }
}

/* ----------------------------------------------------------------- render */

let renderSeq = 0;
async function render() {
  const code = editor.getValue().trim();
  save();
  $('#type-chip').textContent = code ? detectType(code) : '—';
  if (!code) {
    $('#stage').innerHTML = '';
    currentSvgEl = null;
    setStatus('Empty diagram', 'muted');
    hideError();
    enableExports(false);
    return;
  }
  const seq = ++renderSeq;
  const t0 = performance.now();
  try {
    const svg = await renderToSvg(code, {
      theme: state.theme,
      layout: state.layout,
      config: parsedConfig(),
      css: state.css,
    });
    if (seq !== renderSeq) return;
    const stage = $('#stage');
    stage.innerHTML = svg;
    currentSvgEl = stage.querySelector('svg');
    if (currentSvgEl) {
      currentSvgEl.removeAttribute('height');
      currentSvgEl.style.maxWidth = 'none';
    }
    hideError();
    const ms = Math.round(performance.now() - t0);
    const r = currentSvgEl ? currentSvgEl.getBoundingClientRect() : { width: 0, height: 0 };
    setStatus(`Rendered in ${ms} ms`, 'ok');
    $('#dims').textContent = `${Math.round(r.width)} × ${Math.round(r.height)} px`;
    enableExports(true);
    if (state.autofit) fit();
  } catch (err) {
    if (seq !== renderSeq) return;
    showError(err?.message || String(err));
    setStatus('Syntax error', 'error');
    enableExports(!!currentSvgEl);
  }
}

function setStatus(msg, kind = 'muted') {
  const el = $('#status-msg');
  el.textContent = msg;
  el.className = `status-msg ${kind}`;
}
function showError(message) {
  $('#preview-error-text').textContent = message;
  $('#preview-error').classList.add('show');
}
function hideError() {
  $('#preview-error').classList.remove('show');
}
function enableExports(on) {
  ['#btn-svg', '#btn-png', '#btn-copy', '#btn-export-dialog', '#btn-save', '#btn-share'].forEach((s) => {
    const el = $(s);
    if (el) el.disabled = !on && s !== '#btn-save' && s !== '#btn-share';
  });
}

/* --------------------------------------------------------------- pan/zoom */

function applyTransform() {
  $('#stage').style.transform = `translate(${view.tx}px, ${view.ty}px) scale(${view.z})`;
  $('#zoom-level').textContent = `${Math.round(view.z * 100)}%`;
}
function fit() {
  if (!currentSvgEl) return;
  const pv = $('#preview').getBoundingClientRect();
  const r = currentSvgEl.getBoundingClientRect();
  const natW = r.width / view.z;
  const natH = r.height / view.z;
  const pad = 56;
  const z = Math.min((pv.width - pad) / natW, (pv.height - pad) / natH, 4);
  view.z = z > 0 && Number.isFinite(z) ? z : 1;
  view.tx = (pv.width - natW * view.z) / 2;
  view.ty = (pv.height - natH * view.z) / 2;
  applyTransform();
}
function resetZoom() {
  view.z = 1;
  const pv = $('#preview').getBoundingClientRect();
  const r = currentSvgEl ? currentSvgEl.getBoundingClientRect() : { width: 0, height: 0 };
  view.tx = Math.max(24, (pv.width - r.width) / 2);
  view.ty = 24;
  applyTransform();
}
function zoomBy(factor, cx, cy) {
  const pv = $('#preview').getBoundingClientRect();
  const px = (cx ?? pv.left + pv.width / 2) - pv.left;
  const py = (cy ?? pv.top + pv.height / 2) - pv.top;
  const newZ = Math.min(Math.max(view.z * factor, 0.1), 8);
  view.tx = px - (px - view.tx) * (newZ / view.z);
  view.ty = py - (py - view.ty) * (newZ / view.z);
  view.z = newZ;
  applyTransform();
}
function setupPanZoom() {
  const pv = $('#preview');
  pv.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX, e.clientY);
  }, { passive: false });
  let dragging = false, sx = 0, sy = 0;
  pv.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.zoom-controls') || e.target.closest('.preview-tools')) return;
    dragging = true;
    sx = e.clientX - view.tx;
    sy = e.clientY - view.ty;
    pv.setPointerCapture(e.pointerId);
    pv.classList.add('grabbing');
  });
  pv.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    view.tx = e.clientX - sx;
    view.ty = e.clientY - sy;
    applyTransform();
  });
  const stop = () => {
    dragging = false;
    pv.classList.remove('grabbing');
  };
  pv.addEventListener('pointerup', stop);
  pv.addEventListener('pointercancel', stop);
}

/* ------------------------------------------------------------ appearance */

function applyBackground() {
  const pv = $('#preview');
  pv.classList.remove('bg-transparent', 'bg-white', 'bg-dark', 'bg-custom');
  if (BG_COLORS[state.background]) {
    pv.classList.add(`bg-${state.background}`);
    pv.style.removeProperty('--custom-bg');
  } else {
    pv.classList.add('bg-custom');
    pv.style.setProperty('--custom-bg', state.background);
  }
  $$('#bg-group .seg').forEach((b) => b.classList.toggle('active', b.dataset.bg === state.background));
}
function applyAppTheme() {
  document.documentElement.dataset.appTheme = state.appTheme;
  $('#app-theme-toggle').textContent = state.appTheme === 'dark' ? '☾' : '☀';
}

/* --------------------------------------------------------------- exports */

function bgForExport() {
  // The server resolves preset names; custom colors are passed through.
  return state.background;
}
function exportOpts(extra = {}) {
  return {
    code: editor.getValue(),
    theme: state.theme,
    layout: state.layout,
    background: bgForExport(),
    scale: state.scale,
    config: parsedConfig(),
    css: state.css,
    svgEl: currentSvgEl,
    ...extra,
  };
}
function busy(btn, fn) {
  return async () => {
    if (!btn) return fn();
    btn.classList.add('loading');
    const was = btn.disabled;
    btn.disabled = true;
    try {
      await fn();
    } catch (err) {
      toast(err.message || 'Export failed', 'error');
    } finally {
      btn.classList.remove('loading');
      btn.disabled = was;
    }
  };
}

/* ----------------------------------------------------------- export dialog */

function syncExportDialog() {
  const fmt = $('#exp-format').value;
  const show = (sel, on) => $$(`[data-when="${sel}"]`).forEach((el) => (el.style.display = on ? '' : 'none'));
  show('raster', RASTER.includes(fmt));
  show('lossy', LOSSY.includes(fmt));
  show('bg', fmt !== 'svg');
  show('pdf', fmt === 'pdf');
  const fixed = fmt === 'pdf' && $('#exp-pdf-paper').value !== 'auto';
  show('pdf-fixed', fixed);
  $('#exp-copy').style.display = RASTER.includes(fmt) ? '' : 'none';
}
function openExportDialog() {
  if (!currentSvgEl) return toast('Nothing to export', 'error');
  // seed from current state
  $('#exp-scale').value = state.scale;
  $$('#exp-bg-group .seg').forEach((b) => b.classList.toggle('active', b.dataset.bg === state.background));
  if (BG_COLORS[state.background]) $('#exp-bg-color').value = state.background === 'transparent' ? '#ffffff' : BG_COLORS[state.background];
  else $('#exp-bg-color').value = state.background;
  syncExportDialog();
  $('#export-modal').classList.add('show');
}
function readExportDialog() {
  const fmt = $('#exp-format').value;
  const activeBg = $('#exp-bg-group .seg.active')?.dataset.bg;
  let background = activeBg || 'white';
  // If the color picker was touched and no preset is active, use the color.
  if (!activeBg) background = $('#exp-bg-color').value;
  return {
    format: fmt,
    background,
    scale: Number($('#exp-scale').value) || 2,
    quality: Number($('#exp-quality').value) || 92,
    pdfPaper: $('#exp-pdf-paper').value,
    pdfLandscape: $('#exp-pdf-landscape').checked,
    pdfFit: $('#exp-pdf-fit').checked,
  };
}

/* ------------------------------------------------------------- file & share */

function openFile() {
  $('#file-input').click();
}
function loadFileText(text, name) {
  editor.setValue(text);
  render();
  toast(`Loaded ${name}`, 'ok');
}
function saveFile() {
  const blob = new Blob([editor.getValue()], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'diagram.mmd';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast('Saved diagram.mmd', 'ok');
}
async function share() {
  const url = buildShareUrl({
    code: editor.getValue(),
    theme: state.theme,
    layout: state.layout,
    background: state.background,
    config: state.config,
    css: state.css,
  });
  history.replaceState(null, '', url);
  try {
    await navigator.clipboard.writeText(url);
    toast('Shareable link copied', 'ok');
  } catch {
    toast('Link set in address bar', 'ok');
  }
}

/* ----------------------------------------------------------- fullscreen */

function toggleFullscreen() {
  const pane = $('.preview-pane');
  if (!document.fullscreenElement) pane.requestFullscreen?.().then(() => setTimeout(fit, 100));
  else document.exitFullscreen?.();
}

/* ------------------------------------------------------------------ meta */

async function loadMeta() {
  try {
    return await (await fetch('/api/meta')).json();
  } catch {
    return { themes: ['default', 'neutral', 'dark', 'forest', 'base'], layouts: ['dagre', 'elk'], examples: [] };
  }
}
function populateSelect(sel, items, current) {
  sel.innerHTML = '';
  items.forEach((t) => {
    const o = document.createElement('option');
    o.value = t;
    o.textContent = t;
    sel.appendChild(o);
  });
  sel.value = current;
}
function populateExamples(examples) {
  const sel = $('#examples-select');
  sel.innerHTML = '<option value="">Examples…</option>';
  examples.forEach((ex) => {
    const o = document.createElement('option');
    o.value = ex.id;
    o.textContent = ex.label;
    o.dataset.code = ex.code;
    sel.appendChild(o);
  });
}

/* ------------------------------------------------------------------ init */

async function init() {
  const hashState = readHashState();
  const saved = load();
  const seed = hashState || saved;
  if (seed) {
    state.theme = seed.theme || state.theme;
    state.layout = seed.layout || state.layout;
    state.background = seed.background || state.background;
    state.scale = seed.scale || state.scale;
    state.appTheme = seed.appTheme || state.appTheme;
    state.config = seed.config || '';
    state.css = seed.css || '';
    state.autofit = seed.autofit ?? state.autofit;
    state.wrap = seed.wrap ?? state.wrap;
    state.fontSize = seed.fontSize || state.fontSize;
  }

  applyAppTheme();
  applyBackground();
  $('#config-input').value = state.config;
  $('#css-input').value = state.css;
  $('#btn-autofit').classList.toggle('active', state.autofit);
  $('#btn-wrap').classList.toggle('active', state.wrap);

  editor = createEditor($('#editor'), {
    value: seed?.code ?? FALLBACK_DIAGRAM,
    onChange: () => render(),
  });
  editor.setWrap(state.wrap);
  editor.setFontSize(state.fontSize);
  editor.onCursor(() => {
    const c = editor.cursor();
    $('#cursor-pos').textContent = `Ln ${c.line}, Col ${c.col}`;
    $('#char-count').textContent = `${editor.getValue().length} chars`;
  });

  const meta = await loadMeta();
  populateSelect($('#theme-select'), meta.themes || [], state.theme);
  populateSelect($('#layout-select'), meta.layouts || ['dagre', 'elk'], state.layout);
  populateExamples(meta.examples || []);
  if (!seed && meta.examples?.length) editor.setValue(meta.examples[0].code);

  /* ---- toolbar ---- */
  $('#theme-select').addEventListener('change', (e) => { state.theme = e.target.value; save(); render(); });
  $('#layout-select').addEventListener('change', (e) => { state.layout = e.target.value; save(); render(); });
  $('#examples-select').addEventListener('change', (e) => {
    const opt = e.target.selectedOptions[0];
    if (opt?.dataset.code) { editor.setValue(opt.dataset.code); render(); }
    e.target.value = '';
  });
  $$('#bg-group .seg').forEach((b) =>
    b.addEventListener('click', () => { state.background = b.dataset.bg; applyBackground(); save(); })
  );
  $('#app-theme-toggle').addEventListener('click', () => {
    state.appTheme = state.appTheme === 'dark' ? 'light' : 'dark';
    applyAppTheme();
    save();
  });

  /* ---- file / share ---- */
  $('#btn-new').addEventListener('click', () => {
    if (editor.getValue().trim() && !confirm('Clear the editor?')) return;
    editor.setValue('');
    render();
  });
  $('#btn-open').addEventListener('click', openFile);
  $('#file-input').addEventListener('change', (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => loadFileText(String(reader.result), f.name);
    reader.readAsText(f);
    e.target.value = '';
  });
  $('#btn-save').addEventListener('click', saveFile);
  $('#btn-share').addEventListener('click', busy($('#btn-share'), share));

  // drag & drop a file onto the window
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    const f = e.dataTransfer?.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => loadFileText(String(reader.result), f.name);
    reader.readAsText(f);
  });

  /* ---- quick exports ---- */
  $('#btn-svg').addEventListener('click', busy($('#btn-svg'), async () => {
    if (!currentSvgEl) throw new Error('Nothing to export');
    downloadSvg(currentSvgEl, 'diagram.svg');
    toast('Saved diagram.svg', 'ok');
  }));
  $('#btn-png').addEventListener('click', busy($('#btn-png'), async () => {
    await downloadAs(exportOpts({ format: 'png', filename: 'diagram.png' }));
    toast('Saved diagram.png', 'ok');
  }));
  $('#btn-copy').addEventListener('click', busy($('#btn-copy'), async () => {
    if (!currentSvgEl) throw new Error('Nothing to copy');
    await copySvgText(currentSvgEl);
    toast('SVG copied to clipboard', 'ok');
  }));

  /* ---- export dialog ---- */
  $('#btn-export-dialog').addEventListener('click', openExportDialog);
  $('#exp-cancel').addEventListener('click', () => $('#export-modal').classList.remove('show'));
  $('#export-modal').addEventListener('click', (e) => { if (e.target.id === 'export-modal') e.currentTarget.classList.remove('show'); });
  $('#exp-format').addEventListener('change', syncExportDialog);
  $('#exp-pdf-paper').addEventListener('change', syncExportDialog);
  $$('#exp-bg-group .seg').forEach((b) =>
    b.addEventListener('click', () => $$('#exp-bg-group .seg').forEach((x) => x.classList.toggle('active', x === b)))
  );
  $('#exp-bg-color').addEventListener('input', () => $$('#exp-bg-group .seg').forEach((x) => x.classList.remove('active')));
  $('#exp-download').addEventListener('click', busy($('#exp-download'), async () => {
    const o = readExportDialog();
    await downloadAs(exportOpts({ ...o, filename: `diagram.${o.format}` }));
    $('#export-modal').classList.remove('show');
    toast(`Saved diagram.${o.format}`, 'ok');
  }));
  $('#exp-copy').addEventListener('click', busy($('#exp-copy'), async () => {
    const o = readExportDialog();
    await copyImage(exportOpts(o));
    $('#export-modal').classList.remove('show');
    toast('Image copied to clipboard', 'ok');
  }));

  /* ---- settings drawer ---- */
  $('#btn-settings').addEventListener('click', () => $('#drawer').classList.toggle('open'));
  $('#drawer-close').addEventListener('click', () => $('#drawer').classList.remove('open'));
  $$('.tabs .tab').forEach((tab) =>
    tab.addEventListener('click', () => {
      $$('.tabs .tab').forEach((t) => t.classList.toggle('active', t === tab));
      $$('.tab-pane').forEach((p) => p.classList.toggle('active', p.dataset.pane === tab.dataset.tab));
    })
  );
  let cfgTimer;
  $('#config-input').addEventListener('input', (e) => {
    state.config = e.target.value;
    clearTimeout(cfgTimer);
    cfgTimer = setTimeout(() => { save(); render(); }, 300);
  });
  let cssTimer;
  $('#css-input').addEventListener('input', (e) => {
    state.css = e.target.value;
    clearTimeout(cssTimer);
    cssTimer = setTimeout(() => { save(); render(); }, 300);
  });

  /* ---- editor controls ---- */
  $('#btn-wrap').addEventListener('click', () => {
    state.wrap = !state.wrap;
    editor.setWrap(state.wrap);
    $('#btn-wrap').classList.toggle('active', state.wrap);
    save();
  });
  $('#btn-font-inc').addEventListener('click', () => { state.fontSize = Math.min(24, state.fontSize + 1); editor.setFontSize(state.fontSize); save(); });
  $('#btn-font-dec').addEventListener('click', () => { state.fontSize = Math.max(9, state.fontSize - 1); editor.setFontSize(state.fontSize); save(); });

  /* ---- preview tools ---- */
  $('#zoom-in').addEventListener('click', () => zoomBy(1.2));
  $('#zoom-out').addEventListener('click', () => zoomBy(1 / 1.2));
  $('#zoom-fit').addEventListener('click', fit);
  $('#zoom-reset').addEventListener('click', resetZoom);
  $('#btn-fullscreen').addEventListener('click', toggleFullscreen);
  $('#btn-autofit').addEventListener('click', () => {
    state.autofit = !state.autofit;
    $('#btn-autofit').classList.toggle('active', state.autofit);
    save();
    if (state.autofit) fit();
  });
  setupPanZoom();
  window.addEventListener('mstudio:resize', () => editor.refresh && editor.refresh());

  /* ---- help ---- */
  $('#btn-help').addEventListener('click', () => $('#help-modal').classList.add('show'));
  $('#help-cancel').addEventListener('click', () => $('#help-modal').classList.remove('show'));
  $('#help-modal').addEventListener('click', (e) => { if (e.target.id === 'help-modal') e.currentTarget.classList.remove('show'); });

  /* ---- keyboard ---- */
  window.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); $('#btn-svg').click(); }
    else if (mod && e.key.toLowerCase() === 'e') { e.preventDefault(); openExportDialog(); }
    else if (mod && e.key.toLowerCase() === 'o') { e.preventDefault(); openFile(); }
    else if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#btn-share').click(); }
    else if (mod && e.key === '0') { e.preventDefault(); fit(); }
    else if (e.key === 'Escape') {
      $('#export-modal').classList.remove('show');
      $('#help-modal').classList.remove('show');
      if (document.fullscreenElement) document.exitFullscreen?.();
    } else if (!mod && e.key === '?' && e.target === document.body) {
      $('#help-modal').classList.add('show');
    } else if (!mod && (e.key === 'f' || e.key === 'F') && e.target === document.body) {
      toggleFullscreen();
    }
  });

  enableExports(false);
  if (editor.refresh) editor.refresh();
  if (hashState) toast('Loaded shared diagram', 'ok');
  await render();
  setTimeout(fit, 80);
  editor.focus();
}

init();
