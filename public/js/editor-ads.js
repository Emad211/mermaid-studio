const CONFIG_ENDPOINT = '/api/ads';
const DESKTOP_QUERY = '(min-width: 1440px) and (min-height: 600px)';
const DOCK_QUERY = '(min-width: 360px) and (max-width: 1439px) and (min-height: 600px)';
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
  const token = config.editor?.frameTokens?.[slot];
  if (token) url.searchParams.set('token', token);
  return url;
}

function configureSandbox(frame, url) {
  const permissions = ['allow-scripts', 'allow-popups', 'allow-popups-to-escape-sandbox'];
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
  if (!('IntersectionObserver' in window)) return () => {};
  let timer = null;
  let sent = false;
  let rendered = false;
  const cancel = () => {
    if (timer) window.clearTimeout(timer);
    timer = null;
  };
  const observer = new IntersectionObserver((entries) => {
    const entry = entries[0];
    const eligible = rendered
      && entry?.isIntersecting
      && entry.intersectionRatio >= VIEWABILITY_RATIO
      && document.visibilityState === 'visible';
    if (!eligible) {
      cancel();
      return;
    }
    if (sent || timer) return;
    timer = window.setTimeout(() => {
      if (!rendered || document.visibilityState !== 'visible') {
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
  return () => {
    rendered = true;
  };
}

function selectShell(shells) {
  let preferred = '';
  if (window.matchMedia(DESKTOP_QUERY).matches) preferred = 'editorRail';
  else if (window.matchMedia(DOCK_QUERY).matches) preferred = 'editorDock';
  if (!preferred) return null;
  return shells.find((shell) => shell.dataset.adSlot === preferred && !shell.hidden) || null;
}

function preserveReservedShell(shells, active, state) {
  shells.forEach((shell) => {
    const selected = shell === active;
    shell.hidden = !selected;
    shell.dataset.adState = selected ? state : 'inactive';
  });
}

async function initializeEditorAds() {
  const shells = [...document.querySelectorAll('[data-editor-ad-slot][data-ad-slot]')];
  if (!shells.length) return;

  const active = selectShell(shells);
  if (!active) {
    shells.forEach((shell) => {
      shell.hidden = true;
      shell.dataset.adState = 'viewport-ineligible';
    });
    return;
  }

  let config;
  try {
    const response = await fetch(CONFIG_ENDPOINT, {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`ADS_CONFIG_${response.status}`);
    config = await response.json();
  } catch {
    preserveReservedShell(shells, active, 'config-error');
    dispatch('error', active.dataset.adSlot || 'editor-config');
    return;
  }

  const slot = active.dataset.adSlot;
  if (!config?.enabled
    || !config.editor?.enabled
    || !config.slots?.[slot]
    || !config.editor?.frameTokens?.[slot]) {
    preserveReservedShell(shells, active, 'unavailable');
    return;
  }

  preserveReservedShell(shells, active, 'reserved');
  const frame = active.querySelector('[data-editor-ad-frame]');
  if (!frame) return;
  const url = frameUrl(config, slot);
  configureSandbox(frame, url);
  frame.referrerPolicy = 'origin';
  active.dataset.adState = 'loading';
  const markRendered = observeViewability(active, slot);

  const expectedOrigin = url.origin === location.origin ? 'null' : url.origin;
  const onMessage = (event) => {
    if (event.source !== frame.contentWindow) return;
    if (expectedOrigin !== 'null' && event.origin !== expectedOrigin) return;
    const message = event.data;
    if (!message || message.source !== 'nemodara-editor-ad' || message.slot !== slot) return;
    if (!['loaded', 'rendered', 'no-fill', 'blocked', 'error'].includes(message.type)) return;
    active.dataset.adState = message.type;
    if (message.type === 'rendered') markRendered();
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
