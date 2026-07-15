const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const SNIPPETS = [
  {
    id: 'flowchart',
    title: 'شروع فلوچارت پایه',
    keywords: 'flowchart فرایند شرط',
    mode: 'replace',
    code: `flowchart TD\n  A[شروع] --> B{شرط؟}\n  B -- بله --> C[مرحله بعد]\n  B -- خیر --> D[بازبینی]`,
  },
  {
    id: 'sequence',
    title: 'شروع Sequence Diagram',
    keywords: 'sequence api پیام',
    mode: 'replace',
    code: `sequenceDiagram\n  actor U as کاربر\n  participant W as وب‌اپ\n  participant A as API\n  U->>W: ثبت درخواست\n  W->>A: POST /requests\n  A-->>W: 201 Created\n  W-->>U: نمایش نتیجه`,
  },
  {
    id: 'subgraph',
    title: 'شروع فلوچارت Subgraph',
    keywords: 'subgraph گروه مرز',
    mode: 'replace',
    code: `flowchart LR\n  Client[کاربر] --> API\n  subgraph Service[سرویس]\n    API[API] --> DB[(Database)]\n  end`,
  },
  {
    id: 'er',
    title: 'شروع ER Diagram',
    keywords: 'erd database دیتابیس',
    mode: 'replace',
    code: `erDiagram\n  USER ||--o{ ORDER : places\n  USER {\n    int id PK\n    string email\n  }\n  ORDER {\n    int id PK\n    int user_id FK\n  }`,
  },
  {
    id: 'classdef',
    title: 'شروع فلوچارت استایل‌دار',
    keywords: 'style classdef رنگ',
    mode: 'replace',
    code: `flowchart TD\n  A[مرحله مهم] --> B[ادامه]\n  classDef accent fill:#e9f4ee,stroke:#1f5b43,color:#183d2f\n  class A accent`,
  },
  {
    id: 'comment',
    title: 'درج توضیح در کد',
    keywords: 'comment توضیح',
    code: `%% این توضیح در خروجی نمودار نمایش داده نمی‌شود`,
  },
];

let api = null;
let selectedIndex = 0;
let filteredCommands = [];

function faNumber(value) {
  return String(value).replace(/\d/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)]);
}

function exampleCommands() {
  const select = $('#examples-select');
  if (!select) return [];
  return [...select.options].filter((option) => option.value).map((option) => {
    const value = option.value;
    const label = option.textContent.trim();
    return {
      id: `example-${value}`,
      title: `نمونه: ${label}`,
      hint: 'بارگذاری نمودار آماده و قابل ویرایش',
      search: `نمونه آماده ${label} ${value}`,
      run: () => {
        select.value = value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      },
    };
  });
}

function commands() {
  return [
    { id: 'new', title: 'نمودار جدید', hint: 'پاک‌کردن سند و شروع دوباره', keys: 'Ctrl N', run: () => $('#btn-new')?.click() },
    { id: 'open', title: 'بازکردن فایل', hint: 'فایل mmd، Mermaid یا Markdown', keys: 'Ctrl O', run: () => $('#btn-open')?.click() },
    { id: 'save', title: 'ذخیرهٔ فایل Mermaid', hint: 'دانلود منبع قابل ویرایش', keys: 'Ctrl Shift S', run: () => $('#btn-save')?.click() },
    { id: 'export', title: 'دریافت خروجی', hint: 'SVG، PNG، WebP یا PDF', keys: 'Ctrl E', run: () => $('#btn-export-dialog')?.click() },
    { id: 'share', title: 'کپی لینک اشتراک‌گذاری', hint: 'کد و تنظیمات داخل URL', keys: 'Ctrl Shift K', run: () => $('#btn-share')?.click() },
    { id: 'fit', title: 'جا دادن نمودار در قاب', hint: 'تنظیم Zoom و موقعیت', keys: 'Ctrl 0', run: () => api?.fit?.() },
    { id: 'settings', title: 'بازکردن تنظیمات Mermaid و CSS', hint: 'Config و CSS اختصاصی', keys: '', run: () => $('#btn-settings')?.click() },
    { id: 'theme', title: 'تغییر پوستهٔ رابط', hint: 'روشن یا تیره', keys: '', run: () => $('#app-theme-toggle')?.click() },
    { id: 'help', title: 'نمایش راهنمای میانبرها', hint: 'فهرست کلیدهای سریع ادیتور', keys: '', run: () => $('#help-modal')?.classList.add('show') },
    ...exampleCommands(),
    ...SNIPPETS.map((snippet) => ({
      id: `snippet-${snippet.id}`,
      title: snippet.title,
      hint: snippet.mode === 'replace' ? 'ساخت یک نمودار کامل و قابل ویرایش' : 'درج در محل نشانگر',
      keys: '+',
      search: snippet.keywords,
      run: () => snippet.mode === 'replace' ? api?.setCode?.(snippet.code) : api?.insert?.(snippet.code),
    })),
  ];
}

function openPalette() {
  const modal = $('#command-modal');
  if (!modal) return;
  modal.classList.add('show');
  modal.setAttribute('aria-hidden', 'false');
  $('#command-input').value = '';
  selectedIndex = 0;
  renderCommands('');
  requestAnimationFrame(() => $('#command-input').focus());
}

function closePalette() {
  const modal = $('#command-modal');
  if (!modal) return;
  modal.classList.remove('show');
  modal.setAttribute('aria-hidden', 'true');
  api?.focus?.();
}

function renderCommands(query) {
  const normalized = String(query || '').trim().toLowerCase();
  const terms = normalized.split(/\s+/).filter(Boolean);
  filteredCommands = commands().filter((command) => {
    const haystack = `${command.title} ${command.hint} ${command.search || ''}`.toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
  selectedIndex = Math.min(selectedIndex, Math.max(0, filteredCommands.length - 1));
  const list = $('#command-list');
  list.innerHTML = filteredCommands.length ? filteredCommands.map((command, index) => `<button type="button" class="command-item ${index === selectedIndex ? 'is-selected' : ''}" data-command-index="${index}"><span><strong>${command.title}</strong><small>${command.hint}</small></span>${command.keys ? `<kbd>${command.keys}</kbd>` : ''}</button>`).join('') : '<div class="command-empty">فرمانی با این عبارت پیدا نشد.</div>';
  list.querySelector('.is-selected')?.scrollIntoView({ block: 'nearest' });
}

function runSelected(index = selectedIndex) {
  const command = filteredCommands[index];
  if (!command) return;
  closePalette();
  command.run();
}

function suggestionsFor(message) {
  const text = String(message || '').toLowerCase();
  const suggestions = [];
  if (/quote|string|unterminated|expecting.*text/.test(text)) suggestions.push('کوتیشن‌های خط فعلی و خط قبل را جفت کن.');
  if (/bracket|square|curly|paren|expecting.*close/.test(text)) suggestions.push('براکت، پرانتز و آکولاد باز را بررسی کن.');
  if (/lexical|parse|syntax/.test(text)) suggestions.push('بخش جدید را موقتاً حذف کن و کد را مرحله‌به‌مرحله برگردان.');
  if (/subgraph/.test(text)) suggestions.push('برای هر subgraph یک end لازم است.');
  if (/sequence/.test(text)) suggestions.push('نام participant و جهت فلش پیام را بررسی کن.');
  if (!suggestions.length) {
    suggestions.push('اولین خط گزارش‌شده و یک خط قبل از آن را بررسی کن.');
    suggestions.push('متن دارای دونقطه، پرانتز یا نویسهٔ خاص را داخل کوتیشن بگذار.');
  }
  suggestions.push('اگر مشکل باقی ماند، یک نمونهٔ حداقلی بساز و بخش‌ها را یکی‌یکی اضافه کن.');
  return [...new Set(suggestions)].slice(0, 4);
}

function renderDiagnostic(detail = {}) {
  const panel = $('#diagnostics-panel');
  if (!panel) return;
  const status = $('#diagnostics-status');
  const title = $('#diagnostics-title');
  const body = $('#diagnostics-body');
  const actions = $('#diagnostics-actions');
  panel.classList.toggle('has-error', !detail.ok);
  panel.classList.toggle('is-clean', detail.ok);
  if (detail.ok) {
    status.textContent = 'بدون خطا';
    title.textContent = detail.type ? `${detail.type} با موفقیت رندر شد` : 'نمودار آماده است';
    body.innerHTML = `<p>${detail.elapsed ? `رندر در ${faNumber(detail.elapsed)} میلی‌ثانیه انجام شد.` : 'آخرین تغییر بدون خطای Parser پردازش شد.'}</p>`;
    actions.innerHTML = '';
    return;
  }
  status.textContent = detail.line ? `خط ${faNumber(detail.line)}` : 'خطای Parser';
  title.textContent = 'کد به اصلاح نیاز دارد';
  const suggestions = suggestionsFor(detail.raw || detail.message);
  body.innerHTML = `<p>${detail.summary || 'Mermaid نتوانست این بخش را پردازش کند.'}</p><ul>${suggestions.map((item) => `<li>${item}</li>`).join('')}</ul><details><summary>جزئیات فنی</summary><pre>${String(detail.raw || detail.message || '').replace(/[&<>]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[character])}</pre></details>`;
  actions.innerHTML = `${detail.line ? '<button type="button" data-diagnostic-action="line">رفتن به خط</button>' : ''}<button type="button" data-diagnostic-action="copy">کپی جزئیات</button>`;
  panel.classList.add('is-open');
}

function setMobilePane(name) {
  document.body.dataset.mobilePane = name;
  $$('[data-mobile-pane]').forEach((button) => {
    const active = button.dataset.mobilePane === name;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  if (name === 'editor') api?.refresh?.();
  if (name === 'preview') requestAnimationFrame(() => api?.fit?.());
}

function setup() {
  api = window.nemodaraEditor;
  if (!api) return;
  $('#btn-command')?.addEventListener('click', openPalette);
  $('#command-close')?.addEventListener('click', closePalette);
  $('#command-modal')?.addEventListener('click', (event) => {
    if (event.target.id === 'command-modal') closePalette();
  });
  $('#command-input')?.addEventListener('input', (event) => {
    selectedIndex = 0;
    renderCommands(event.target.value);
  });
  $('#command-input')?.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      selectedIndex = Math.min(filteredCommands.length - 1, selectedIndex + 1);
      renderCommands(event.currentTarget.value);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      selectedIndex = Math.max(0, selectedIndex - 1);
      renderCommands(event.currentTarget.value);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      runSelected();
    } else if (event.key === 'Escape') {
      closePalette();
    }
  });
  $('#command-list')?.addEventListener('click', (event) => {
    const item = event.target.closest('[data-command-index]');
    if (item) runSelected(Number(item.dataset.commandIndex));
  });
  $$('[data-mobile-pane]').forEach((button) => button.addEventListener('click', () => setMobilePane(button.dataset.mobilePane)));
  $('#diagnostics-toggle')?.addEventListener('click', () => $('#diagnostics-panel').classList.toggle('is-open'));
  $('#diagnostics-actions')?.addEventListener('click', async (event) => {
    const action = event.target.closest('[data-diagnostic-action]')?.dataset.diagnosticAction;
    const detail = window.__nemodaraLastDiagnostic || {};
    if (action === 'line' && detail.line) api.goToLine?.(detail.line);
    if (action === 'copy') {
      try {
        await navigator.clipboard.writeText(detail.raw || detail.message || '');
      } catch {
        // Clipboard can be unavailable in embedded browsers.
      }
    }
  });
  window.addEventListener('keydown', (event) => {
    const modifier = event.ctrlKey || event.metaKey;
    if (modifier && event.key.toLowerCase() === 'k' && !event.shiftKey) {
      event.preventDefault();
      openPalette();
    } else if (event.key === 'Escape' && $('#command-modal')?.classList.contains('show')) {
      event.preventDefault();
      closePalette();
    }
  }, { capture: true });
  setMobilePane('editor');
  renderDiagnostic({ ok: true });
}

window.addEventListener('nemodara:editor-ready', setup, { once: true });
window.addEventListener('nemodara:diagnostic', (event) => {
  window.__nemodaraLastDiagnostic = event.detail || {};
  renderDiagnostic(event.detail || {});
});
window.addEventListener('nemodara:autosaved', (event) => {
  const node = $('#save-state');
  if (!node) return;
  const date = new Date(event.detail?.at || Date.now());
  node.textContent = `ذخیرهٔ محلی ${date.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })}`;
  node.classList.add('is-saved');
});

if (window.nemodaraEditor) setup();
