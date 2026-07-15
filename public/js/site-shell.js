const THEME_KEY = 'mstudio:site-theme';
const root = document.documentElement;
const button = document.querySelector('#theme-toggle');

function setTheme(theme, persist = false) {
  const next = theme === 'dark' ? 'dark' : 'light';
  root.dataset.theme = next;
  if (persist) localStorage.setItem(THEME_KEY, next);
  if (!button) return;
  button.textContent = next === 'dark' ? '☾' : '☀';
  button.setAttribute('aria-label', next === 'dark' ? 'فعال کردن پوسته روشن' : 'فعال کردن پوسته تیره');
}

const saved = localStorage.getItem(THEME_KEY);
const preferred = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
setTheme(saved || preferred);
button?.addEventListener('click', () => setTheme(root.dataset.theme === 'dark' ? 'light' : 'dark', true));
