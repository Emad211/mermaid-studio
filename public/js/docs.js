import { startBidiIsolation } from './bidi.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function bytesToBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function editorUrlFor(code) {
  const state = { code, theme: 'default', layout: 'dagre', background: 'white', config: '', css: '' };
  const token = 'u:' + bytesToBase64Url(new TextEncoder().encode(JSON.stringify(state)));
  return `/editor#code=${encodeURIComponent(token)}`;
}

function codeFor(button) {
  const id = button.dataset.copyTarget || button.dataset.openTarget;
  return id ? document.getElementById(id)?.textContent || '' : '';
}

function showCopyFeedback(button, message) {
  const previous = button.textContent;
  button.textContent = message;
  setTimeout(() => { button.textContent = previous; }, 1600);
}

function setupExamples() {
  for (const button of $$('[data-copy-target]')) {
    button.addEventListener('click', async () => {
      const code = codeFor(button);
      if (!code) return;
      try {
        await navigator.clipboard.writeText(code.trim());
        showCopyFeedback(button, 'کپی شد ✓');
      } catch {
        showCopyFeedback(button, 'کپی نشد');
      }
    });
  }

  for (const link of $$('[data-open-target]')) {
    const code = codeFor(link);
    if (code) link.href = editorUrlFor(code.trim());
  }
}

function setupReadingProgress() {
  const progress = $('#article-progress');
  const article = $('.article-main');
  if (!progress || !article) return;
  const update = () => {
    const start = article.getBoundingClientRect().top + window.scrollY;
    const end = start + article.offsetHeight - window.innerHeight;
    const ratio = end <= start ? 1 : Math.min(1, Math.max(0, (window.scrollY - start) / (end - start)));
    progress.style.width = `${ratio * 100}%`;
  };
  update();
  document.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
}

function setupActiveToc() {
  const sections = $$('.article-section[id]');
  const links = $$('[data-article-toc] a[href^="#"]');
  if (!sections.length || !links.length || !('IntersectionObserver' in window)) return;
  const map = new Map(links.map((link) => [link.getAttribute('href').slice(1), link]));
  const observer = new IntersectionObserver((entries) => {
    const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
    if (!visible) return;
    links.forEach((link) => link.classList.remove('is-active'));
    map.get(visible.target.id)?.classList.add('is-active');
  }, { rootMargin: '-15% 0px -70% 0px', threshold: [0, .1] });
  sections.forEach((section) => observer.observe(section));
}

function closeMobileTocAfterNavigation() {
  const toc = $('.mobile-toc');
  if (!toc) return;
  toc.addEventListener('click', (event) => {
    if (event.target.closest('a')) toc.removeAttribute('open');
  });
}

startBidiIsolation();
setupExamples();
setupReadingProgress();
setupActiveToc();
closeMobileTocAfterNavigation();
