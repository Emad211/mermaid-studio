const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const THEME_KEY = 'mstudio:site-theme';

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(THEME_KEY, theme);
  const button = $('#theme-toggle');
  if (button) {
    button.textContent = theme === 'dark' ? '☾' : '☀';
    button.setAttribute('aria-label', theme === 'dark' ? 'فعال کردن پوسته روشن' : 'فعال کردن پوسته تیره');
  }
}

function bytesToBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function editorUrlFor(code) {
  const state = {
    code,
    theme: 'default',
    layout: 'dagre',
    background: 'white',
    config: '',
    css: '',
  };
  const token = 'u:' + bytesToBase64Url(new TextEncoder().encode(JSON.stringify(state)));
  return `/editor#code=${encodeURIComponent(token)}`;
}

function codeFor(button) {
  const id = button.dataset.copyTarget || button.dataset.openTarget;
  return id ? document.getElementById(id)?.textContent || '' : '';
}

function setupExamples() {
  for (const button of $$('[data-copy-target]')) {
    button.addEventListener('click', async () => {
      const code = codeFor(button);
      if (!code) return;
      const old = button.textContent;
      try {
        await navigator.clipboard.writeText(code.trim());
        button.textContent = 'کپی شد ✓';
      } catch {
        button.textContent = 'کپی نشد';
      }
      setTimeout(() => { button.textContent = old; }, 1600);
    });
  }

  for (const link of $$('[data-open-target]')) {
    const code = codeFor(link);
    if (code) link.href = editorUrlFor(code.trim());
  }
}


setTheme(localStorage.getItem(THEME_KEY) || 'dark');
$('#theme-toggle')?.addEventListener('click', () => {
  setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
});
setupExamples();
