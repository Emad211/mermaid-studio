const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const SNIPPETS = {
  flowchart: `flowchart TD\n  A[شروع] --> B{شرط درست است؟}\n  B -- بله --> C[ادامه]\n  B -- خیر --> D[بازبینی]\n  D --> B`,
  sequence: `sequenceDiagram\n  actor User as کاربر\n  participant Web as وب‌اپ\n  participant API\n  User->>Web: ثبت درخواست\n  Web->>API: POST /requests\n  API-->>Web: 201 Created\n  Web-->>User: نمایش نتیجه`,
  erd: `erDiagram\n  CUSTOMER ||--o{ ORDER : places\n  ORDER ||--|{ ORDER_ITEM : contains\n  PRODUCT ||--o{ ORDER_ITEM : appears_in`,
  subgraph: `subgraph Service[نام سرویس]\n  A[ورودی] --> B[پردازش]\nend`,
  style: `classDef success fill:#dcfce7,stroke:#16a34a,color:#14532d\nclassDef danger fill:#fee2e2,stroke:#dc2626,color:#7f1d1d`,
  note: `note right of API: توضیح کوتاه و مشخص`,
};

let api = null;
let activeIndex = 0;
let visibleCommands = [];
let lastDiagnostic = null;

function fa(value) {
  return String(value).replace(/\d/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)]);
}

function commands() {
  return [
    { id: 'new', title: 'نمودار جدید', detail: 'پاک‌کردن سند فعلی با تأیید', keys: 'Ctrl N', run: () => $('#btn-new')?.click() },
    { id: 'open', title: 'بازکردن فایل', detail: '.mmd، Markdown یا متن', keys: 'Ctrl O', run: () => $('#btn-open')?.click() },
    { id: 'save', title: 'ذخیرهٔ فایل Mermaid', detail: 'دریافت diagram.mmd', keys: 'Ctrl Shift S', run: () => $('#btn-save')?.click() },
    { id: 'export', title: 'تنظیم و دریافت خروجی', detail: 'SVG، PNG، WebP، JPG یا PDF', keys: 'Ctrl E', run: () => $('#btn-export-dialog')?.click() },
    { id: 'share', title: 'کپی لینک اشتراک‌گذاری', detail: 'کد و تنظیمات داخل URL', keys: 'Ctrl Shift K', run: () => $('#btn-share')?.click() },
    { id: 'fit', title: 'جا دادن نمودار در پیش‌نمایش', detail: 'تنظیم زوم و مرکز', keys: 'Ctrl 0', run: () => $('#zoom-fit')?.click() },
    { id: 'theme', title: 'تغییر پوستهٔ ادیتور', detail: 'روشن یا تیره', run: () => $('#app-theme-toggle')?.click() },
    { id: 'settings', title: 'بازکردن تنظیمات Mermaid و CSS', detail: 'Config و استایل سفارشی', run: () => $('#btn-settings')?.click() },
    { id: 'insert-flow', title: 'درج فلوچارت تصمیم', detail: 'نمونهٔ کوچک و قابل تغییر', group: 'درج', run: () => api.insert(`\n${SNIPPETS.flowchart}\n`) },
    { id: 'insert-sequence', title: 'درج Sequence Diagram', detail: 'کاربر، وب‌اپ و API', group: 'درج', run: () => api.insert(`\n${SNIPPETS.sequence}\n`) },
    { id: 'insert-erd', title: 'درج ER Diagram', detail: 'مشتری، سفارش و محصول', group: 'درج', run: () => api.insert(`\n${SNIPPETS.erd}\n`) },
    { id: 'insert-subgraph', title: 'درج subgraph', detail: 'گروه‌بندی اجزای نمودار', group: 'درج', run: () => api.insert(`\n${SNIPPETS.subgraph}\n`) },
    { id: 'insert-style', title: 'درج classDef خوانا', detail: 'سبک موفق و خطا', group: 'درج', run: () => api.insert(`\n${SNIPPETS.style}\n`) },
    { id: 'learn-errors', title: 'بازکردن راهنمای رفع خطا', detail: 'در یک تب جدید', group: 'راهنما', run: () => window.open('/learn/mermaid-errors', '_blank', 'noopener') },
    { id: 'learn-syntax', title: 'مرکز آموزش Mermaid', detail: 'راهنما و تمرین فارسی', group: 'راهنما', run: () => window.open('/learn', '_blank', 'noopener') },
  ];
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function matches(command, query) {
  const haystack = `${command.title} ${command.detail || ''} ${command.group || ''}`.toLowerCase();
  return !query || haystack.includes(query.toLowerCase());
}

function renderCommands() {
  const query = $('#command-search')?.value.trim() || '';
  visibleCommands = commands().filter((command) => matches(command, query));
  activeIndex = Math.max(0, Math.min(activeIndex, visibleCommands.length - 1));
  const list = $('#command-list');
  if (!list) return;
  list.innerHTML = visibleCommands.length ? visibleCommands.map((command, index) => `<button class="command-item ${index === activeIndex ? 'is-active' : ''}" type="button" data-command-index="${index}"><span><strong>${escapeHtml(command.title)}</strong><small>${escapeHtml(command.detail || '')}</small></span>${command.keys ? `<kbd>${escapeHtml(command.keys)}</kbd>` : command.group ? `<em>${escapeHtml(command.group)}</em>` : ''}</button>`).join('') : '<div class="command-empty">فرمانی پیدا نشد.</div>';
  list.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' });
}

function openPalette() {
  const palette = $('#command-palette');
  if (!palette) return;
  palette.classList.add('show');
  palette.setAttribute('aria-hidden', 'false');
  activeIndex = 0;
  $('#command-search').value = '';
  renderCommands();
  requestAnimationFrame(() => $('#command-search')?.focus());
}

function closePalette() {
  const palette = $('#command-palette');
  palette?.classList.remove('show');
  palette?.setAttribute('aria-hidden', 'true');
}

function runCommand(index) {
  const command = visibleCommands[index];
  if (!command) return;
  closePalette();
  command.run();
}

function errorLine(message) {
  const match = /(?:line|خط)\s*[:#]?\s*(\d+)/i.exec(message || '');
  return match ? Number(match[1]) : 0;
}

function diagnosticSuggestions(message, code) {
  const suggestions = [];
  const lower = String(message || '').toLowerCase();
  if (/parse|syntax|expecting|lexical/.test(lower)) suggestions.push('خط گزارش‌شده و خط قبل را برای براکت، کوتیشن یا keyword ناقص بررسی کن.');
  if ((code.match(/"/g) || []).length % 2) suggestions.push('تعداد کوتیشن‌ها فرد است؛ یک رشته احتمالاً بسته نشده است.');
  const openSquare = (code.match(/\[/g) || []).length - (code.match(/\]/g) || []).length;
  const openRound = (code.match(/\(/g) || []).length - (code.match(/\)/g) || []).length;
  const openCurly = (code.match(/\{/g) || []).length - (code.match(/\}/g) || []).length;
  if (openSquare) suggestions.push('تعداد براکت‌های [ و ] برابر نیست.');
  if (openRound) suggestions.push('تعداد پرانتزهای ( و ) برابر نیست.');
  if (openCurly) suggestions.push('تعداد آکولادهای { و } برابر نیست.');
  if (/unknown diagram|no diagram type/i.test(lower)) suggestions.push('خط اول باید نوع نمودار را مشخص کند؛ مانند flowchart TD یا sequenceDiagram.');
  if (/security|unsafe|url\(/i.test(lower)) suggestions.push('منبع خارجی یا CSS ناامن در نسخهٔ عمومی مسدود است.');
  if (!suggestions.length) suggestions.push('نمودار را تا کوچک‌ترین نمونهٔ قابل رندر کم کن و بخش‌ها را یکی‌یکی برگردان.');
  return suggestions.slice(0, 4);
}

function renderDiagnostic(detail) {
  lastDiagnostic = detail;
  const panel = $('#diagnostics-panel');
  if (!panel) return;
  if (detail.ok) {
    panel.className = 'diagnostics-panel diagnostics-panel--ok';
    panel.innerHTML = `<div class="diagnostic-status"><span></span><strong>کد معتبر است</strong><small>${detail.elapsed ? `رندر در ${fa(detail.elapsed)} میلی‌ثانیه` : 'پیش‌نمایش آماده است'}</small></div>`;
    return;
  }
  const code = api?.getCode?.() || '';
  const line = detail.line || errorLine(detail.message);
  const suggestions = diagnosticSuggestions(detail.message, code);
  panel.className = 'diagnostics-panel diagnostics-panel--error';
  panel.innerHTML = `<header><div><span class="diagnostic-dot"></span><strong>رندر ناموفق است${line ? ` · خط ${fa(line)}` : ''}</strong></div><div>${line ? `<button id="diagnostic-goto" type="button">رفتن به خط</button>` : ''}<button id="diagnostic-copy" type="button">کپی گزارش</button></div></header><p>${escapeHtml(String(detail.message || '').split('\n')[0])}</p><ul>${suggestions.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
  $('#diagnostic-goto')?.addEventListener('click', () => api.gotoLine(line));
  $('#diagnostic-copy')?.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(detail.message || ''); $('#diagnostic-copy').textContent = 'کپی شد'; }
    catch { $('#diagnostic-copy').textContent = 'کپی نشد'; }
  });
}

function setupMobilePane() {
  const buttons = $$('[data-mobile-pane]');
  const activate = (pane) => {
    document.body.dataset.mobilePane = pane;
    buttons.forEach((button) => {
      const active = button.dataset.mobilePane === pane;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    window.dispatchEvent(new Event('mstudio:resize'));
  };
  buttons.forEach((button) => button.addEventListener('click', () => activate(button.dataset.mobilePane)));
  activate('editor');
}

function setup() {
  if (!api || document.documentElement.dataset.editorExperienceReady) return;
  document.documentElement.dataset.editorExperienceReady = 'true';
  $('#btn-command')?.addEventListener('click', openPalette);
  $('#command-close')?.addEventListener('click', closePalette);
  $('#command-palette')?.addEventListener('click', (event) => { if (event.target.id === 'command-palette') closePalette(); });
  $('#command-search')?.addEventListener('input', () => { activeIndex = 0; renderCommands(); });
  $('#command-search')?.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); activeIndex = Math.min(visibleCommands.length - 1, activeIndex + 1); renderCommands(); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); activeIndex = Math.max(0, activeIndex - 1); renderCommands(); }
    else if (event.key === 'Enter') { event.preventDefault(); runCommand(activeIndex); }
    else if (event.key === 'Escape') closePalette();
  });
  $('#command-list')?.addEventListener('click', (event) => {
    const item = event.target.closest('[data-command-index]');
    if (item) runCommand(Number(item.dataset.commandIndex));
  });
  setupMobilePane();
  window.addEventListener('nemodara:diagnostic', (event) => renderDiagnostic(event.detail || {}));
  window.addEventListener('nemodara:autosaved', (event) => {
    const element = $('#save-state');
    if (!element) return;
    const time = new Date(event.detail?.at || Date.now()).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
    element.textContent = `ذخیرهٔ محلی · ${time}`;
    element.classList.add('is-saved');
  });
  window.addEventListener('keydown', (event) => {
    const modifier = event.ctrlKey || event.metaKey;
    if (modifier && event.key.toLowerCase() === 'k' && !event.shiftKey) {
      event.preventDefault();
      openPalette();
    }
  }, { capture: true });
  $('#diagnostics-toggle')?.addEventListener('click', () => $('#diagnostics-panel')?.classList.toggle('is-collapsed'));
  renderCommands();
}

window.addEventListener('nemodara:editor-ready', (event) => {
  api = event.detail;
  setup();
});

if (window.nemodaraEditor) {
  api = window.nemodaraEditor;
  setup();
}
