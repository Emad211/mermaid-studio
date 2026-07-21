const STYLE_ID = 'nemodara-bidi-style';
const SKIP_SELECTOR = [
  'script',
  'style',
  'code',
  'pre',
  'kbd',
  'samp',
  'textarea',
  'input',
  'select',
  'option',
  'svg',
  'math',
  'bdi',
  '[dir="ltr"]',
  '[data-no-bidi]',
  '[contenteditable="true"]',
].join(',');

// A strong LTR run may contain several English words or technical tokens such as
// "State Diagram", "SVG / PNG / PDF", "stateDiagram-v2" or a URL.
const LTR_RUN = /(?:https?:\/\/[^\s<>]+|(?:[A-Za-z0-9][A-Za-z0-9._:+\/#()@-]*)(?:[ \t]+(?:\/[ \t]+)?(?:[A-Za-z0-9][A-Za-z0-9._:+\/#()@-]*))*)/g;

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .latin-run {
      direction: ltr;
      unicode-bidi: isolate;
      display: inline;
    }
    :is(.docs-sidebar, .article-aside, .mobile-toc) nav {
      gap: 3px;
    }
    :is(.docs-sidebar, .article-aside, .mobile-toc) nav a {
      display: block;
      text-align: right;
      line-height: 1.95;
      word-break: normal;
      overflow-wrap: break-word;
    }
    :is(.article-summary, .article-section, .doc-deck, .article-deck, .journal-card, .template-card) {
      text-align: right;
    }
    .docs-sidebar {
      min-width: 0;
    }
    .docs-sidebar nav {
      display: grid;
    }
    @media (max-width: 900px) {
      .docs-sidebar { display: none !important; }
    }
  `;
  document.head.append(style);
}

function shouldSkip(node) {
  const parent = node.parentElement;
  if (!parent || !/[A-Za-z0-9]/.test(node.nodeValue || '')) return true;
  return Boolean(parent.closest(SKIP_SELECTOR));
}

function isolateTextNode(node) {
  const source = node.nodeValue || '';
  LTR_RUN.lastIndex = 0;
  let match = LTR_RUN.exec(source);
  if (!match) return;

  const fragment = document.createDocumentFragment();
  let cursor = 0;
  do {
    if (match.index > cursor) fragment.append(source.slice(cursor, match.index));
    const isolated = document.createElement('bdi');
    isolated.className = 'latin-run';
    isolated.dir = 'ltr';
    isolated.textContent = match[0];
    fragment.append(isolated);
    cursor = match.index + match[0].length;
    match = LTR_RUN.exec(source);
  } while (match);

  if (cursor < source.length) fragment.append(source.slice(cursor));
  node.replaceWith(fragment);
}

export function applyBidiIsolation(root = document.body) {
  if (!root) return;
  installStyles();

  if (root.nodeType === Node.TEXT_NODE) {
    if (!shouldSkip(root)) isolateTextNode(root);
    return;
  }

  if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;
  if (root.nodeType === Node.ELEMENT_NODE && root.matches?.(SKIP_SELECTOR)) return;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let current;
  while ((current = walker.nextNode())) {
    if (!shouldSkip(current)) nodes.push(current);
  }
  nodes.forEach(isolateTextNode);
}

export function startBidiIsolation(root = document.body) {
  if (!root) return null;
  applyBidiIsolation(root);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) applyBidiIsolation(node);
    }
  });
  observer.observe(root, { childList: true, subtree: true });
  return observer;
}
