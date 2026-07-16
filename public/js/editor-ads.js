const CONFIG_ENDPOINT = '/api/ads';
const DESKTOP_QUERY = '(min-width: 1440px)';
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
  // allow-same-origin is used only when the advertising document has a separate
  // origin. It improves publisher-script compatibility without exposing the
  // editor DOM or Mermaid source.
  if (!sameOrigin(url.href)) permissions.push('allow-same-origin');
  frame.setAttribute('sandbox', permissions.join(' '));
}

function afterPageSettles(delayMs) {
  return new Promise((resolve) => {
    const start = () => window.setTimeout(resolve, Math.max(0, delayMs));
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(start, { timeout: Math.max(2_500, delayMs + 900) });
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
    if (!entry || !entry.isIntersecting || entry.intersectionRatio < VIEWABILITY_RATIO || document.visibilityState !== 'visible') {
      cancel();
      return;
    }
    if (sent || timer) return;
    timer = window.setTimeout(() => {
      if (document.visibilityState !== 'visible') {
        cancel();
        return;
      }
      sent = true;
      timer = null;
      shell.dataset.adViewable = 'true';
      dispatch('viewable', slot);
      observer.disconnect();
    }, VIEWABILITY_MS);
  }, { threshold: [0, VIEWABILITY_RATIO, 1] });
  observer.observe(shell);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') cancel();
  });
}

function selectShell(shells) {
  const desktop = window.matchMedia(DESKTOP_QUERY).matches;
  const preferred = desktop ? 'editorRail' : 'editorDock';
  return shells.find((shell) => shell.dataset.adSlot === preferred && !shell.hidden)
    || shells.find((shell) => !shell.hidden)
    || null;
}

function disableShells(shells, state) {
  shells.forEach((shell) => {
    shell.hidden = true;
    shell.dataset.adState = state;
  });
}

async function initializeEditorAds() {
  const shells = [...document.querySelectorAll('[data-editor-ad-slot][data-ad-slot]')];
  if (!shells.length) return;

  // The server assigns the rollout bucket before rendering `/editor`. When the
  // visitor is outside the rollout, every shell is already hidden in the first
  // HTML response, so the page does not collapse after JavaScript starts.
  const active = selectShell(shells);
  if (!active) return;

  let config;
  try {
    const response = await fetch(CONFIG_ENDPOINT, { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`ADS_CONFIG_${response.status}`);
    config = await response.json();
  } catch {
    disableShells(shells, 'config-error');
    dispatch('error', 'editor-config');
    return;
  }

  if (!config?.enabled || !config.editor?.enabled) {
    disableShells(shells, 'disabled');
    return;
  }

  shells.forEach((shell) => {
    const enabled = shell === active && Boolean(config.slots?.[shell.dataset.adSlot]);
    shell.hidden = !enabled;
    if (!enabled) shell.dataset.adState = 'inactive';
  });
  if (active.hidden) return;

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

  await afterPageSettles(Number(config.editor.loadDelayMs) || Number(config.loadDelayMs) || 0);
  frame.src = url.href;
}

initializeEditorAds();
