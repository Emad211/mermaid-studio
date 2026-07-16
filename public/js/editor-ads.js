const CONFIG_ENDPOINT = '/api/ads';
const DESKTOP_QUERY = '(min-width: 1360px)';
const VIEWABILITY_RATIO = 0.5;
const VIEWABILITY_MS = 1_000;

function dispatch(type, slot) {
  window.dispatchEvent(new CustomEvent('mstudio:ad', { detail: { type, slot } }));
}

function sameOrigin(value) {
  try {
    return new URL(value, location.href).origin === location.origin;
  } catch {
    return true;
  }
}

function frameUrl(config, slot) {
  const origin = config.editor?.frameOrigin || location.origin;
  const url = new URL(config.editor?.framePath || '/ads/editor-frame', `${origin}/`);
  url.searchParams.set('slot', slot);
  return url;
}

function configureSandbox(frame, url) {
  const permissions = ['allow-scripts', 'allow-popups', 'allow-popups-to-escape-sandbox'];
  // allow-same-origin is safe only when the ad document is on a separate
  // origin. It improves compatibility with publisher scripts without exposing
  // the editor DOM or Mermaid source.
  if (!sameOrigin(url.href)) permissions.push('allow-same-origin');
  frame.setAttribute('sandbox', permissions.join(' '));
}

function afterPageSettles(delayMs) {
  return new Promise((resolve) => {
    const start = () => window.setTimeout(resolve, Math.max(0, delayMs));
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(start, { timeout: Math.max(1_500, delayMs + 700) });
    } else if (document.readyState === 'complete') start();
    else window.addEventListener('load', start, { once: true });
  });
}

function observeViewability(shell, slot) {
  if (!('IntersectionObserver' in window)) return;
  let timer = null;
  let sent = false;
  const cancel = () => {
    if (timer) window.clearTimeout(timer);
    timer = null;
  };
  const observer = new IntersectionObserver((entries) => {
    const entry = entries[0];
    if (!entry || !entry.isIntersecting || entry.intersectionRatio < VIEWABILITY_RATIO) {
      cancel();
      return;
    }
    if (sent || timer) return;
    timer = window.setTimeout(() => {
      sent = true;
      timer = null;
      shell.dataset.adViewable = 'true';
      dispatch('viewable', slot);
      observer.disconnect();
    }, VIEWABILITY_MS);
  }, { threshold: [0, VIEWABILITY_RATIO, 1] });
  observer.observe(shell);
}

function selectShell(shells) {
  const desktop = window.matchMedia(DESKTOP_QUERY).matches;
  const preferred = desktop ? 'editorRail' : 'editorDock';
  return shells.find((shell) => shell.dataset.adSlot === preferred && !shell.hidden)
    || shells.find((shell) => !shell.hidden)
    || null;
}

async function initializeEditorAds() {
  const shells = [...document.querySelectorAll('[data-editor-ad-slot][data-ad-slot]')];
  if (!shells.length) return;

  let config;
  try {
    const response = await fetch(CONFIG_ENDPOINT, { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`ADS_CONFIG_${response.status}`);
    config = await response.json();
  } catch {
    shells.forEach((shell) => { shell.hidden = true; });
    dispatch('error', 'editor-config');
    return;
  }

  if (!config?.enabled || !config.editor?.enabled) {
    shells.forEach((shell) => { shell.hidden = true; });
    return;
  }

  const active = selectShell(shells);
  shells.forEach((shell) => {
    const enabled = shell === active && Boolean(config.slots?.[shell.dataset.adSlot]);
    shell.hidden = !enabled;
    if (!enabled) shell.dataset.adState = 'inactive';
  });
  if (!active || active.hidden) return;

  const slot = active.dataset.adSlot;
  const frame = active.querySelector('[data-editor-ad-frame]');
  if (!frame) return;
  const url = frameUrl(config, slot);
  configureSandbox(frame, url);
  frame.referrerPolicy = 'origin';
  active.dataset.adState = 'loading';
  observeViewability(active, slot);

  const expectedOrigin = url.origin === location.origin ? 'null' : url.origin;
  const onMessage = (event) => {
    if (event.source !== frame.contentWindow) return;
    if (expectedOrigin !== 'null' && event.origin !== expectedOrigin) return;
    const message = event.data;
    if (!message || message.source !== 'nemodara-editor-ad' || message.slot !== slot) return;
    if (!['loaded', 'blocked', 'error'].includes(message.type)) return;
    active.dataset.adState = message.type;
    dispatch(message.type, slot);
  };
  window.addEventListener('message', onMessage);

  frame.addEventListener('error', () => {
    active.dataset.adState = 'error';
    dispatch('error', slot);
  }, { once: true });

  await afterPageSettles(Number(config.loadDelayMs) || 0);
  frame.src = url.href;
}

initializeEditorAds();
