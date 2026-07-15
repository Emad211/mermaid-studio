/** Mermaid Studio — Persian-first GUI controller. */

import { renderToSvg, detectType } from '/js/mermaid-runtime.js';
import { createEditor } from '/js/editor.js';
import { downloadSvg, downloadAs, copySvgText, copyImage } from '/js/exporter.js';
import { buildShareUrl, readHashState } from '/js/share.js';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const STORE_KEY = 'mstudio:v2';
const MAX_STORED_CODE_LENGTH = 100_000;
const MAX_STORED_SETTINGS_LENGTH = 50_000;
const FALLBACK_DIAGRAM = `flowchart TD
    A[دریافت درخواست] --> B{اطلاعات کامل است؟}
    B -- بله --> C[بررسی کارشناس]
    B -- خیر --> D[تکمیل اطلاعات]
    D --> B
    C --> E[اعلام نتیجه]`;

const BG_COLORS = { transparent: 'transparent', white: '#ffffff', dark: '#1e1e2e' };
const RASTER = ['png', 'jpg', 'webp'];
const LOSSY = ['jpg', 'webp'];

const THEME_LABELS = {
  default: 'پیش‌فرض',
  neutral: 'خنثی',
  dark: 'تیره',
  forest: 'جنگلی',
  base: 'پایه',
};

const LAYOUT_LABELS = { dagre: 'Dagre — استاندارد', elk: 'ELK — نمودارهای سازگار' };

const TYPE_LABELS = {
  flowchart: 'فلوچارت',
  sequence: 'نمودار توالی',
  class: 'نمودار کلاس',
  state: 'نمودار حالت',
  'entity-relationship': 'نمودار ER',
  'user journey': 'سفر کاربر',
  gantt: 'گانت',
  pie: 'دایره‌ای',
  quadrant: 'چهار ناحیه',
  requirement: 'نیازمندی‌ها',
  'git graph': 'تاریخچه Git',
  gitgraph: 'تاریخچه Git',
  C4: 'معماری C4',
  mindmap: 'نقشه ذهنی',
  timeline: 'خط زمانی',
  sankey: 'سنکی',
  'xy chart': 'نمودار XY',
  xychart: 'نمودار XY',
  block: 'بلوک',
  packet: 'بسته شبکه',
  kanban: 'کانبان',
  architecture: 'معماری',
  radar: 'رادار',
  zenuml: 'ZenUML',
  unknown: 'نامشخص',
};

const EXAMPLE_LABELS = {
  flowchart: 'فلوچارت',
  sequence: 'نمودار توالی',
  class: 'نمودار کلاس',
  state: 'نمودار حالت',
  er: 'مدل ارتباط موجودیت‌ها (ER)',
  gantt: 'گانت پروژه',
  pie: 'نمودار دایره‌ای',
  mindmap: 'نقشه ذهنی',
  gitgraph: 'تاریخچه Git',
  journey: 'سفر کاربر',
  timeline: 'خط زمانی',
  quadrant: 'ماتریس چهار ناحیه',
  architecture: 'معماری با آیکون',
  math: 'فرمول ریاضی',
  c4: 'معماری C4',
  sankey: 'نمودار سنکی',
  xychart: 'نمودار XY',
};

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
let renderSequence = 0;
let toastTimer = null;
const view = { z: 1, tx: 0, ty: 0 };

function faNumber(value) {
  return String(value).replace(/\d/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)]);
}

function loadStoredState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORE_KEY));
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return null;
    if (typeof stored.code !== 'string' || stored.code.length > MAX_STORED_CODE_LENGTH) return null;
    if (typeof stored.config === 'string' && stored.config.length > MAX_STORED_SETTINGS_LENGTH) return null;
    if (typeof stored.css === 'string' && stored.css.length > MAX_STORED_SETTINGS_LENGTH) return null;
    return stored;
  } catch {
    return null;
  }
}

function saveState() {
  if (!editor) return;
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ code: editor.getValue(), ...state }));
  } catch {
    /* Local storage can be unavailable or full. Editing must still work. */
  }
  window.dispatchEvent(new CustomEvent('nemodara:autosaved', { detail: { at: Date.now() } }));
}

function toast(message, kind = 'info') {
  const element = $('#toast');
  if (!element) return;
  element.textContent = message;
  element.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (element.className = 'toast'), 2800);
}

function setStatus(message, kind = 'muted') {
  const element = $('#status-msg');
  if (!element) return;
  element.textContent = message;
  element.className = `status-msg ${kind}`;
}

function updateEditorMeta() {
  if (!editor) return;
  const cursor = editor.cursor();
  $('#cursor-pos').textContent = `خط ${faNumber(cursor.line)}، ستون ${faNumber(cursor.col)}`;
  $('#char-count').textContent = `${faNumber(editor.getValue().length)} نویسه`;
}

function parsedConfig() {
  const raw = state.config.trim();
  if (!raw) {
    $('#config-error').textContent = '';
    return {};
  }
  try {
    const object = JSON.parse(raw);
    if (!object || Array.isArray(object) || typeof object !== 'object') {
      throw new Error('مقدار اصلی باید یک شیء JSON باشد.');
    }
    $('#config-error').textContent = '';
    return object;
  } catch (error) {
    $('#config-error').textContent = `JSON نامعتبر است: ${error.message}`;
    return {};
  }
}

function friendlyError(error) {
  const raw = error?.message || String(error || 'خطای ناشناخته');
  const line = /line\s+(\d+)/i.exec(raw)?.[1];
  const prefix = line
    ? `Mermaid نتوانست خط ${faNumber(line)} را پردازش کند. سینتکس همان خط و خط قبل را بررسی کنید.`
    : 'Mermaid نتوانست این کد را پردازش کند. براکت‌ها، کوتیشن‌ها و نوع نمودار را بررسی کنید.';
  return `${prefix}\n\nجزئیات فنی:\n${raw}`;
}

function showError(error) {
  const raw = error?.message || String(error || '');
  const line = Number(/line\s+(\d+)/i.exec(raw)?.[1] || /line:\s*(\d+)/i.exec(raw)?.[1] || 0);
  const message = friendlyError(error);
  window.dispatchEvent(new CustomEvent('nemodara:diagnostic', { detail: { ok: false, line, raw, message, summary: line ? `خط ${faNumber(line)} و خط قبل را بررسی کن.` : 'ساختار این بخش با سینتکس Mermaid هماهنگ نیست.' } }));
}

function enableExports(enabled) {
  ['#btn-svg', '#btn-png', '#btn-copy', '#btn-export-dialog', '#btn-save', '#btn-share'].forEach((selector) => {
    const element = $(selector);
    if (!element) return;
    element.disabled = !enabled && selector !== '#btn-save' && selector !== '#btn-share';
  });
}

async function render() {
  const code = editor.getValue().trim();
  saveState();
  updateEditorMeta();

  const detected = code ? detectType(code) : null;
  $('#type-chip').textContent = detected ? TYPE_LABELS[detected] || detected : '—';

  if (!code) {
    $('#stage').replaceChildren();
    currentSvgEl = null;
    $('#dims').textContent = '';
    setStatus('کد نمودار خالی است', 'muted');
    window.dispatchEvent(new CustomEvent('nemodara:diagnostic', { detail: { ok: true, type: '', elapsed: 0 } }));
    enableExports(false);
    return;
  }

  const sequence = ++renderSequence;
  const startedAt = performance.now();
  setStatus('در حال ساخت نمودار…', 'muted');

  try {
    const svg = await renderToSvg(code, {
      theme: state.theme,
      layout: state.layout,
      config: parsedConfig(),
      css: state.css,
    });
    if (sequence !== renderSequence) return;

    const stage = $('#stage');
    stage.innerHTML = svg;
    currentSvgEl = stage.querySelector('svg');
    if (!currentSvgEl) throw new Error('خروجی Mermaid شامل SVG معتبر نبود.');

    currentSvgEl.removeAttribute('height');
    currentSvgEl.style.maxWidth = 'none';
    currentSvgEl.setAttribute('role', 'img');
    currentSvgEl.setAttribute('aria-label', `پیش‌نمایش ${TYPE_LABELS[detected] || 'نمودار'}`);

    const elapsed = Math.round(performance.now() - startedAt);
    const rect = currentSvgEl.getBoundingClientRect();
    setStatus(`آماده در ${faNumber(elapsed)} میلی‌ثانیه`, 'ok');
    $('#dims').textContent = `${faNumber(Math.round(rect.width))} × ${faNumber(Math.round(rect.height))} پیکسل`;
    window.dispatchEvent(new CustomEvent('nemodara:diagnostic', { detail: { ok: true, type: TYPE_LABELS[detected] || detected || 'نمودار', elapsed } }));
    enableExports(true);
    if (state.autofit) fit();
  } catch (error) {
    if (sequence !== renderSequence) return;
    showError(error);
    setStatus('خطا در کد نمودار', 'error');
    enableExports(Boolean(currentSvgEl));
  }
}

function applyTransform() {
  $('#stage').style.transform = `translate(${view.tx}px, ${view.ty}px) scale(${view.z})`;
  $('#zoom-level').textContent = `${faNumber(Math.round(view.z * 100))}٪`;
}

function fit() {
  if (!currentSvgEl) return;
  const preview = $('#preview').getBoundingClientRect();
  const rect = currentSvgEl.getBoundingClientRect();
  const naturalWidth = rect.width / view.z;
  const naturalHeight = rect.height / view.z;
  if (!naturalWidth || !naturalHeight) return;
  const padding = window.matchMedia('(max-width: 700px)').matches ? 28 : 56;
  const zoom = Math.min(
    (preview.width - padding) / naturalWidth,
    (preview.height - padding) / naturalHeight,
    4,
  );
  view.z = zoom > 0 && Number.isFinite(zoom) ? zoom : 1;
  view.tx = (preview.width - naturalWidth * view.z) / 2;
  view.ty = (preview.height - naturalHeight * view.z) / 2;
  applyTransform();
}

function resetZoom() {
  view.z = 1;
  const preview = $('#preview').getBoundingClientRect();
  const rect = currentSvgEl?.getBoundingClientRect() || { width: 0, height: 0 };
  view.tx = Math.max(24, (preview.width - rect.width) / 2);
  view.ty = 24;
  applyTransform();
}

function zoomBy(factor, clientX, clientY) {
  const preview = $('#preview').getBoundingClientRect();
  const x = (clientX ?? preview.left + preview.width / 2) - preview.left;
  const y = (clientY ?? preview.top + preview.height / 2) - preview.top;
  const nextZoom = Math.min(Math.max(view.z * factor, 0.1), 8);
  view.tx = x - (x - view.tx) * (nextZoom / view.z);
  view.ty = y - (y - view.ty) * (nextZoom / view.z);
  view.z = nextZoom;
  applyTransform();
}

function setupPanZoom() {
  const preview = $('#preview');
  preview.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      zoomBy(event.deltaY < 0 ? 1.12 : 1 / 1.12, event.clientX, event.clientY);
    },
    { passive: false },
  );

  let dragging = false;
  let startX = 0;
  let startY = 0;

  preview.addEventListener('pointerdown', (event) => {
    if (event.target.closest('.zoom-controls, .preview-tools')) return;
    dragging = true;
    startX = event.clientX - view.tx;
    startY = event.clientY - view.ty;
    preview.setPointerCapture(event.pointerId);
    preview.classList.add('grabbing');
  });
  preview.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    view.tx = event.clientX - startX;
    view.ty = event.clientY - startY;
    applyTransform();
  });
  const stop = () => {
    dragging = false;
    preview.classList.remove('grabbing');
  };
  preview.addEventListener('pointerup', stop);
  preview.addEventListener('pointercancel', stop);
}

function applyBackground() {
  const preview = $('#preview');
  preview.classList.remove('bg-transparent', 'bg-white', 'bg-dark', 'bg-custom');
  if (BG_COLORS[state.background]) {
    preview.classList.add(`bg-${state.background}`);
    preview.style.removeProperty('--custom-bg');
  } else {
    preview.classList.add('bg-custom');
    preview.style.setProperty('--custom-bg', state.background);
  }
  $$('#bg-group .seg').forEach((button) => {
    const active = button.dataset.bg === state.background;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function applyAppTheme() {
  document.documentElement.dataset.appTheme = state.appTheme;
  const button = $('#app-theme-toggle');
  button.textContent = state.appTheme === 'dark' ? '☾' : '☀';
  button.setAttribute('aria-label', state.appTheme === 'dark' ? 'فعال کردن پوسته روشن' : 'فعال کردن پوسته تیره');
}

function exportOptions(extra = {}) {
  return {
    code: editor.getValue(),
    theme: state.theme,
    layout: state.layout,
    background: state.background,
    scale: state.scale,
    config: parsedConfig(),
    css: state.css,
    svgEl: currentSvgEl,
    ...extra,
  };
}

function busy(button, action) {
  return async () => {
    if (!button) return action();
    button.classList.add('loading');
    const wasDisabled = button.disabled;
    button.disabled = true;
    try {
      await action();
    } catch (error) {
      toast(error?.message || 'عملیات ناموفق بود.', 'error');
    } finally {
      button.classList.remove('loading');
      button.disabled = wasDisabled;
    }
  };
}

function syncExportDialog() {
  const format = $('#exp-format').value;
  const show = (name, visible) => {
    $$(`[data-when="${name}"]`).forEach((element) => (element.style.display = visible ? '' : 'none'));
  };
  show('raster', RASTER.includes(format));
  show('lossy', LOSSY.includes(format));
  show('bg', format !== 'svg');
  show('pdf', format === 'pdf');
  show('pdf-fixed', format === 'pdf' && $('#exp-pdf-paper').value !== 'auto');
  $('#exp-copy').style.display = RASTER.includes(format) ? '' : 'none';
}

function openExportDialog() {
  if (!currentSvgEl) return toast('ابتدا یک نمودار معتبر بسازید.', 'error');
  $('#exp-scale').value = state.scale;
  $$('#exp-bg-group .seg').forEach((button) => {
    button.classList.toggle('active', button.dataset.bg === state.background);
  });
  const resolved = BG_COLORS[state.background];
  $('#exp-bg-color').value = resolved && resolved !== 'transparent' ? resolved : '#ffffff';
  syncExportDialog();
  $('#export-modal').classList.add('show');
  $('#exp-format').focus();
}

function readExportDialog() {
  const format = $('#exp-format').value;
  const activeBackground = $('#exp-bg-group .seg.active')?.dataset.bg;
  return {
    format,
    background: activeBackground || $('#exp-bg-color').value,
    scale: Number($('#exp-scale').value) || 2,
    quality: Number($('#exp-quality').value) || 92,
    pdfPaper: $('#exp-pdf-paper').value,
    pdfLandscape: $('#exp-pdf-landscape').checked,
    pdfFit: $('#exp-pdf-fit').checked,
  };
}

function openFile() {
  $('#file-input').click();
}

function loadFileText(text, name) {
  editor.setValue(text);
  const safeName = String(name || 'untitled.mmd').replace(/[^A-Za-z0-9._-]/g, '-').slice(0, 100) || 'untitled.mmd';
  $('#document-name').textContent = safeName;
  toast(`فایل «${name}» باز شد.`, 'ok');
}

function saveFile() {
  const blob = new Blob([editor.getValue()], { type: 'text/plain;charset=utf-8' });
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(blob);
  anchor.download = $('#document-name')?.textContent || 'diagram.mmd';
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
  toast('فایل diagram.mmd ذخیره شد.', 'ok');
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
    toast('لینک اشتراک‌گذاری کپی شد.', 'ok');
  } catch {
    toast('لینک در نوار آدرس قرار گرفت؛ آن را از همان‌جا کپی کنید.', 'ok');
  }
}

function toggleFullscreen() {
  const pane = $('.preview-pane');
  if (!document.fullscreenElement) {
    pane.requestFullscreen?.().then(() => setTimeout(fit, 100));
  } else {
    document.exitFullscreen?.();
  }
}

async function loadMeta() {
  try {
    const response = await fetch('/api/meta');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch {
    return {
      themes: ['default', 'neutral', 'dark', 'forest', 'base'],
      layouts: ['dagre', 'elk'],
      examples: [],
    };
  }
}

function populateSelect(select, items, current, labels = {}) {
  select.replaceChildren();
  items.forEach((item) => {
    const option = document.createElement('option');
    option.value = item;
    option.textContent = labels[item] || item;
    select.appendChild(option);
  });
  select.value = current;
}

function populateExamples(examples) {
  const select = $('#examples-select');
  select.innerHTML = '<option value="">انتخاب نمونه…</option>';
  examples.forEach((example) => {
    const option = document.createElement('option');
    option.value = example.id;
    option.textContent = EXAMPLE_LABELS[example.id] || example.label || example.id;
    option.dataset.code = example.code;
    select.appendChild(option);
  });
}

function closeModal(selector) {
  $(selector)?.classList.remove('show');
}

async function init() {
  const hashState = readHashState();
  const savedState = loadStoredState();
  const seed = hashState || savedState;

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
    onChange: render,
  });
  editor.setWrap(state.wrap);
  editor.setFontSize(state.fontSize);
  editor.onCursor(updateEditorMeta);
  updateEditorMeta();

  const meta = await loadMeta();
  populateSelect($('#theme-select'), meta.themes || [], state.theme, THEME_LABELS);
  populateSelect($('#layout-select'), meta.layouts || ['dagre', 'elk'], state.layout, LAYOUT_LABELS);
  populateExamples(meta.examples || []);

  $('#theme-select').addEventListener('change', (event) => {
    state.theme = event.target.value;
    saveState();
    render();
  });
  $('#layout-select').addEventListener('change', (event) => {
    state.layout = event.target.value;
    saveState();
    render();
  });
  $('#examples-select').addEventListener('change', (event) => {
    const option = event.target.selectedOptions[0];
    if (option?.dataset.code) {
      editor.setValue(option.dataset.code);
      toast(`نمونهٔ «${option.textContent}» بارگذاری شد.`, 'ok');
    }
    event.target.value = '';
  });

  $$('#bg-group .seg').forEach((button) => {
    button.addEventListener('click', () => {
      state.background = button.dataset.bg;
      applyBackground();
      saveState();
    });
  });
  $('#app-theme-toggle').addEventListener('click', () => {
    state.appTheme = state.appTheme === 'dark' ? 'light' : 'dark';
    applyAppTheme();
    saveState();
  });

  $('#btn-new').addEventListener('click', () => {
    if (editor.getValue().trim() && !confirm('کد فعلی پاک شود و یک نمودار جدید بسازیم؟')) return;
    editor.setValue('');
    $('#document-name').textContent = 'untitled.mmd';
    editor.focus();
  });
  $('#btn-open').addEventListener('click', openFile);
  $('#file-input').addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => loadFileText(String(reader.result), file.name);
    reader.onerror = () => toast('خواندن فایل ناموفق بود.', 'error');
    reader.readAsText(file);
    event.target.value = '';
  });
  $('#btn-save').addEventListener('click', saveFile);
  $('#btn-share').addEventListener('click', busy($('#btn-share'), share));

  window.addEventListener('dragover', (event) => event.preventDefault());
  window.addEventListener('drop', (event) => {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => loadFileText(String(reader.result), file.name);
    reader.onerror = () => toast('خواندن فایل ناموفق بود.', 'error');
    reader.readAsText(file);
  });

  $('#btn-svg').addEventListener(
    'click',
    busy($('#btn-svg'), async () => {
      if (!currentSvgEl) throw new Error('ابتدا یک نمودار معتبر بسازید.');
      downloadSvg(currentSvgEl, 'diagram.svg');
      toast('فایل SVG ذخیره شد.', 'ok');
    }),
  );
  $('#btn-png').addEventListener(
    'click',
    busy($('#btn-png'), async () => {
      await downloadAs(exportOptions({ format: 'png', filename: 'diagram.png' }));
      toast('فایل PNG روی همین دستگاه ساخته و ذخیره شد.', 'ok');
    }),
  );
  $('#btn-copy').addEventListener(
    'click',
    busy($('#btn-copy'), async () => {
      if (!currentSvgEl) throw new Error('ابتدا یک نمودار معتبر بسازید.');
      await copySvgText(currentSvgEl);
      toast('کد SVG کپی شد.', 'ok');
    }),
  );

  $('#btn-export-dialog').addEventListener('click', openExportDialog);
  $('#exp-cancel').addEventListener('click', () => closeModal('#export-modal'));
  $('#export-modal').addEventListener('click', (event) => {
    if (event.target.id === 'export-modal') closeModal('#export-modal');
  });
  $('#exp-format').addEventListener('change', syncExportDialog);
  $('#exp-pdf-paper').addEventListener('change', syncExportDialog);
  $$('#exp-bg-group .seg').forEach((button) => {
    button.addEventListener('click', () => {
      $$('#exp-bg-group .seg').forEach((item) => item.classList.toggle('active', item === button));
    });
  });
  $('#exp-bg-color').addEventListener('input', () => {
    $$('#exp-bg-group .seg').forEach((item) => item.classList.remove('active'));
  });
  $('#exp-download').addEventListener(
    'click',
    busy($('#exp-download'), async () => {
      const options = readExportDialog();
      await downloadAs(exportOptions({ ...options, filename: `diagram.${options.format}` }));
      closeModal('#export-modal');
      const local = RASTER.includes(options.format) || options.format === 'svg';
      toast(local ? `فایل ${options.format.toUpperCase()} روی همین دستگاه ساخته شد.` : 'فایل PDF ساخته و ذخیره شد.', 'ok');
    }),
  );
  $('#exp-copy').addEventListener(
    'click',
    busy($('#exp-copy'), async () => {
      await copyImage(exportOptions(readExportDialog()));
      closeModal('#export-modal');
      toast('تصویر نمودار کپی شد.', 'ok');
    }),
  );

  $('#btn-settings').addEventListener('click', () => $('#drawer').classList.toggle('open'));
  $('#drawer-close').addEventListener('click', () => $('#drawer').classList.remove('open'));
  $$('.tabs .tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      $$('.tabs .tab').forEach((item) => item.classList.toggle('active', item === tab));
      $$('.tab-pane').forEach((pane) => pane.classList.toggle('active', pane.dataset.pane === tab.dataset.tab));
    });
  });

  let configTimer;
  $('#config-input').addEventListener('input', (event) => {
    state.config = event.target.value;
    clearTimeout(configTimer);
    configTimer = setTimeout(() => {
      saveState();
      render();
    }, 320);
  });
  let cssTimer;
  $('#css-input').addEventListener('input', (event) => {
    state.css = event.target.value;
    clearTimeout(cssTimer);
    cssTimer = setTimeout(() => {
      saveState();
      render();
    }, 320);
  });

  $('#btn-wrap').addEventListener('click', () => {
    state.wrap = !state.wrap;
    editor.setWrap(state.wrap);
    $('#btn-wrap').classList.toggle('active', state.wrap);
    saveState();
  });
  $('#btn-font-inc').addEventListener('click', () => {
    state.fontSize = Math.min(24, state.fontSize + 1);
    editor.setFontSize(state.fontSize);
    saveState();
  });
  $('#btn-font-dec').addEventListener('click', () => {
    state.fontSize = Math.max(9, state.fontSize - 1);
    editor.setFontSize(state.fontSize);
    saveState();
  });

  $('#zoom-in').addEventListener('click', () => zoomBy(1.2));
  $('#zoom-out').addEventListener('click', () => zoomBy(1 / 1.2));
  $('#zoom-fit').addEventListener('click', fit);
  $('#zoom-reset').addEventListener('click', resetZoom);
  $('#btn-fullscreen').addEventListener('click', toggleFullscreen);
  $('#btn-autofit').addEventListener('click', () => {
    state.autofit = !state.autofit;
    $('#btn-autofit').classList.toggle('active', state.autofit);
    saveState();
    if (state.autofit) fit();
  });
  setupPanZoom();
  window.addEventListener('mstudio:resize', () => editor.refresh?.());
  window.addEventListener('resize', () => {
    editor.refresh?.();
    if (state.autofit) requestAnimationFrame(fit);
  });

  $('#btn-help')?.addEventListener('click', () => $('#help-modal').classList.add('show'));
  $('#help-cancel').addEventListener('click', () => closeModal('#help-modal'));
  $('#help-modal').addEventListener('click', (event) => {
    if (event.target.id === 'help-modal') closeModal('#help-modal');
  });

  window.addEventListener('keydown', (event) => {
    const modifier = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    if (modifier && key === 's') {
      event.preventDefault();
      $('#btn-svg').click();
    } else if (modifier && key === 'e') {
      event.preventDefault();
      openExportDialog();
    } else if (modifier && key === 'o') {
      event.preventDefault();
      openFile();
    } else if (modifier && key === 'k' && event.shiftKey) {
      event.preventDefault();
      $('#btn-share').click();
    } else if (modifier && event.key === '0') {
      event.preventDefault();
      fit();
    } else if (event.key === 'Escape') {
      closeModal('#export-modal');
      closeModal('#help-modal');
      $('#drawer').classList.remove('open');
      if (document.fullscreenElement) document.exitFullscreen?.();
    } else if (!modifier && key === 'f' && event.target === document.body) {
      toggleFullscreen();
    }
  });

  function insertCode(code) {
    const current = editor.getValue();
    const prefix = current && !current.endsWith('\n') ? '\n' : '';
    editor.replaceSelection(`${prefix}${String(code || '')}\n`);
    editor.focus();
  }
  window.nemodaraEditor = Object.freeze({
    getCode: () => editor.getValue(),
    setCode: (code) => editor.setValue(String(code || '')),
    insert: insertCode,
    focus: () => editor.focus(),
    refresh: () => editor.refresh?.(),
    fit,
    render,
    share,
    saveFile,
    openExportDialog,
    goToLine: (line) => editor.setCursor?.(line, 1),
  });
  window.dispatchEvent(new CustomEvent('nemodara:editor-ready'));

  enableExports(false);
  editor.refresh?.();
  if (hashState) toast('نمودار از لینک اشتراک‌گذاری بارگذاری شد.', 'ok');
  await render();
  setTimeout(fit, 80);
  editor.focus();
}

init().catch((error) => {
  console.error(error);
  setStatus('راه‌اندازی ادیتور ناموفق بود', 'error');
  toast('ادیتور به‌درستی راه‌اندازی نشد. صفحه را دوباره بارگذاری کنید.', 'error');
});
