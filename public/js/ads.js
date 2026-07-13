/**
 * Small provider-neutral loader for publisher ads.
 * The exact script URL and placement IDs come from the publisher panel and are
 * exposed by /api/ads. With ads disabled this module performs no third-party request.
 */

const SLOT_SELECTOR = '[data-ad-slot]';
const ENDPOINT = '/api/ads';

function prepareYektanetQueue() {
  window.yektanetAnalyticsObject = window.yektanetAnalyticsObject || 'yektanet';
  const objectName = window.yektanetAnalyticsObject;
  if (typeof window[objectName] !== 'function') {
    const queue = function (...args) {
      queue.q.push(args);
    };
    queue.q = [];
    window[objectName] = queue;
  } else if (!Array.isArray(window[objectName].q)) {
    window[objectName].q = [];
  }
}

function mountPlacement(shell, placementId, provider) {
  const mount = shell.querySelector('[data-ad-mount]') || shell;
  const placement = document.createElement('div');
  placement.id = placementId;
  placement.className = 'ad-network-placement';
  placement.dataset.provider = provider;
  mount.replaceChildren(placement);
  shell.hidden = false;
  shell.dataset.adState = 'mounted';
  return shell;
}

function publisherScriptUrl(config) {
  const url = new URL(config.scriptUrl, window.location.href);
  if (config.provider === 'yektanet' && !url.searchParams.has('v')) {
    const now = new Date();
    const hourlyVersion = `${now.getFullYear()}0${now.getMonth()}0${now.getDate()}0${now.getHours()}`;
    url.searchParams.set('v', hourlyVersion);
  }
  return url.href;
}

function loadScript(config) {
  const existing = document.getElementById(config.scriptId);
  if (existing) {
    return Promise.resolve(existing);
  }

  if (config.provider === 'yektanet') prepareYektanetQueue();

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.id = config.scriptId;
    script.src = publisherScriptUrl(config);
    if (config.provider === 'yektanet') {
      script.dataset.analyticsobject = window.yektanetAnalyticsObject;
    }
    script.async = true;
    script.type = 'text/javascript';
    script.referrerPolicy = 'strict-origin-when-cross-origin';
    script.addEventListener('load', () => resolve(script), { once: true });
    script.addEventListener('error', () => reject(new Error('AD_SCRIPT_FAILED')), { once: true });
    document.head.appendChild(script);
  });
}

function afterPageSettles(delayMs) {
  return new Promise((resolve) => {
    const start = () => window.setTimeout(resolve, delayMs);
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(start, { timeout: Math.max(1_200, delayMs + 500) });
    } else if (document.readyState === 'complete') {
      start();
    } else {
      window.addEventListener('load', start, { once: true });
    }
  });
}

function hideSlots(slots, state = 'disabled') {
  for (const slot of slots) {
    slot.dataset.adState = state;
    slot.hidden = true;
  }
}

async function initializeAds() {
  const shells = [...document.querySelectorAll(SLOT_SELECTOR)];
  if (!shells.length) return;

  let config;
  try {
    const response = await fetch(ENDPOINT, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`ADS_CONFIG_${response.status}`);
    config = await response.json();
  } catch {
    hideSlots(shells, 'config-error');
    return;
  }

  if (!config?.enabled || !config.scriptUrl || !config.provider) {
    hideSlots(shells);
    return;
  }

  const active = [];
  for (const shell of shells) {
    const name = shell.dataset.adSlot;
    const placementId = config.slots?.[name];
    if (!placementId) {
      shell.hidden = true;
      continue;
    }
    active.push(mountPlacement(shell, placementId, config.provider));
  }

  if (!active.length) return;
  document.documentElement.dataset.adsProvider = config.provider;

  await afterPageSettles(Number(config.loadDelayMs) || 0);
  try {
    await loadScript(config);
    active.forEach((slot) => {
      slot.dataset.adState = 'loaded';
    });
  } catch {
    hideSlots(active, 'blocked');
  }
}

initializeAds();
