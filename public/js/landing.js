const $ = (selector) => document.querySelector(selector);

const root = document.documentElement;
const themeToggle = $('#theme-toggle');
const savedTheme = localStorage.getItem('mstudio:site-theme');
const preferredTheme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';

function applyTheme(theme) {
  const next = theme === 'light' ? 'light' : 'dark';
  root.dataset.theme = next;
  if (themeToggle) {
    themeToggle.textContent = next === 'dark' ? '☾' : '☀';
    themeToggle.setAttribute('aria-label', next === 'dark' ? 'فعال کردن پوسته روشن' : 'فعال کردن پوسته تیره');
  }
}

applyTheme(savedTheme || preferredTheme);

themeToggle?.addEventListener('click', () => {
  const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('mstudio:site-theme', next);
  applyTheme(next);
});

let toastTimer;
function showToast(message) {
  const toast = $('#copy-toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
}

$('#copy-demo')?.addEventListener('click', async () => {
  const code = $('#demo-code')?.innerText?.trim();
  if (!code) return;
  try {
    await navigator.clipboard.writeText(code);
    showToast('نمونه کد کپی شد');
  } catch {
    showToast('مرورگر اجازهٔ کپی نداد');
  }
});

function safeSponsor(meta) {
  if (!meta?.sponsor?.name || !meta?.sponsor?.url) return;
  const section = $('#sponsor-section');
  const link = $('#sponsor-link');
  const name = $('#sponsor-name');
  const note = $('#sponsor-note');
  if (!section || !link || !name) return;

  name.textContent = meta.sponsor.name;
  link.href = meta.sponsor.url;
  if (meta.sponsor.note && note) note.textContent = meta.sponsor.note;
  section.hidden = false;
}

fetch('/api/meta', { credentials: 'same-origin' })
  .then((response) => (response.ok ? response.json() : null))
  .then((meta) => {
    if (!meta) return;
    const version = $('#app-version');
    if (version) version.textContent = meta.version || '—';
    safeSponsor(meta);
  })
  .catch(() => {
    // The landing page remains fully usable without metadata.
  });
