const ANALYTICS_ENDPOINT = '/api/analytics/event';
const CONFIG_ENDPOINT = '/api/analytics/config';
const SESSION_KEY = 'mstudio:analytics-session';

let configuration = null;
let engagementSeconds = 0;
let visibleSince = document.visibilityState === 'visible' ? performance.now() : null;
let lastRenderState = '';
let lastRenderAt = 0;
let sentVitals = false;
const vitalState = { lcp: null, inp: null, cls: 0, ttfb: null, fcp: null };

function randomSession() {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function sessionId() {
  try {
    let value = sessionStorage.getItem(SESSION_KEY);
    if (!value) {
      value = randomSession();
      sessionStorage.setItem(SESSION_KEY, value);
    }
    return value;
  } catch {
    return randomSession();
  }
}

const session = sessionId();

function campaign() {
  const params = new URLSearchParams(location.search);
  return {
    utmSource: params.get('utm_source') || '',
    utmMedium: params.get('utm_medium') || '',
    utmCampaign: params.get('utm_campaign') || '',
  };
}

function referrerHost() {
  if (!document.referrer) return '';
  try {
    return new URL(document.referrer).hostname;
  } catch {
    return '';
  }
}

function privacyOptOut() {
  return navigator.globalPrivacyControl === true || navigator.doNotTrack === '1' || window.doNotTrack === '1';
}

function payload(event, details = {}) {
  return JSON.stringify({
    event,
    session,
    path: location.pathname,
    referrer: referrerHost(),
    ...campaign(),
    ...details,
  });
}

function send(event, details = {}, { immediate = false } = {}) {
  if (!configuration?.enabled) return;
  if (configuration.respectDnt && privacyOptOut()) return;
  const body = payload(event, details);
  if (body.length > (configuration.maxEventBytes || 4_096)) return;
  if (immediate && navigator.sendBeacon) {
    const blob = new Blob([body], { type: 'application/json' });
    if (navigator.sendBeacon(ANALYTICS_ENDPOINT, blob)) return;
  }
  fetch(ANALYTICS_ENDPOINT, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: immediate,
  }).catch(() => {});
}

function visibleDuration() {
  if (visibleSince === null) return;
  engagementSeconds += Math.max(0, (performance.now() - visibleSince) / 1_000);
  visibleSince = null;
}

function sendEngagement() {
  visibleDuration();
  const seconds = Math.min(300, Math.round(engagementSeconds));
  if (seconds > 0) send('engagement', { seconds }, { immediate: true });
  engagementSeconds = 0;
}

function observeVitals() {
  try {
    const navigation = performance.getEntriesByType('navigation')[0];
    if (navigation) vitalState.ttfb = Math.max(0, navigation.responseStart);

    new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const last = entries[entries.length - 1];
      if (last) vitalState.lcp = last.startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });

    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) vitalState.cls += entry.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });

    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name === 'first-contentful-paint') vitalState.fcp = entry.startTime;
      }
    }).observe({ type: 'paint', buffered: true });

    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.interactionId && (!vitalState.inp || entry.duration > vitalState.inp)) {
          vitalState.inp = entry.duration;
        }
      }
    }).observe({ type: 'event', buffered: true, durationThreshold: 40 });
  } catch {
    // Older browsers can still report page views and product events.
  }
}

function sendVitals() {
  if (sentVitals) return;
  sentVitals = true;
  const metrics = Object.fromEntries(
    Object.entries(vitalState).filter(([, value]) => Number.isFinite(value)),
  );
  if (Object.keys(metrics).length) send('web_vitals', { metrics }, { immediate: true });
}

function trackClicks() {
  document.addEventListener('click', (event) => {
    const target = event.target.closest('a,button');
    if (!target) return;

    if (target.matches('a[href^="/editor"]') && location.pathname !== '/editor') {
      send('editor_open');
    }
    if (target.matches('[data-open-target], .template-card a[href^="/editor"]')) {
      send('template_open');
    }
    if (target.id === 'btn-svg') send('export', { format: 'svg' });
    if (target.id === 'btn-png') send('export', { format: 'png' });
    if (target.id === 'btn-copy') send('copy_svg');
    if (target.id === 'btn-share') send('share');
    if (target.id === 'exp-download') {
      const format = document.querySelector('#exp-format')?.value || '';
      send('export', { format });
    }
    if (target.id === 'exp-copy') send('export', { format: 'clipboard' });
  }, { capture: true });
}

function observeEditor() {
  const status = document.querySelector('#status-msg');
  if (!status) return;
  const inspect = () => {
    const next = status.classList.contains('ok') ? 'render_success'
      : status.classList.contains('error') ? 'render_error' : '';
    const now = Date.now();
    if (next && (next !== lastRenderState || now - lastRenderAt > 8_000)) {
      lastRenderState = next;
      lastRenderAt = now;
      send(next);
    }
  };
  new MutationObserver(inspect).observe(status, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  inspect();
}

function observeAdSlots() {
  const slots = [...document.querySelectorAll('[data-ad-slot]')];
  if (!slots.length || !('IntersectionObserver' in window)) return;
  const viewed = new WeakSet();
  const viewable = new WeakSet();
  const timers = new WeakMap();
  const cancel = (slot) => {
    const timer = timers.get(slot);
    if (timer) window.clearTimeout(timer);
    timers.delete(slot);
  };
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const slot = entry.target;
      const name = slot.dataset.adSlot || 'unknown';
      if (entry.isIntersecting && entry.intersectionRatio >= 0.25 && !viewed.has(slot)) {
        viewed.add(slot);
        send('ad_slot_view', { slot: name });
      }
      const rendered = slot.dataset.adState === 'rendered' || slot.dataset.adRendered === 'true';
      const eligible = rendered
        && entry.isIntersecting
        && entry.intersectionRatio >= 0.5
        && document.visibilityState === 'visible';
      if (!eligible) {
        cancel(slot);
        continue;
      }
      if (viewable.has(slot) || timers.has(slot)) continue;
      timers.set(slot, window.setTimeout(() => {
        timers.delete(slot);
        const stillRendered = slot.dataset.adState === 'rendered' || slot.dataset.adRendered === 'true';
        if (!stillRendered || document.visibilityState !== 'visible' || viewable.has(slot)) return;
        viewable.add(slot);
        send('ad_viewable', { slot: name });
      }, 1_000));
    }
  }, { threshold: [0, 0.25, 0.5, 1] });
  slots.forEach((slot) => observer.observe(slot));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') slots.forEach(cancel);
  });
}

window.addEventListener('mstudio:ad', (event) => {
  const detail = event.detail || {};
  const eventName = {
    request: 'ad_request',
    loaded: 'ad_script_loaded',
    rendered: 'ad_rendered',
    'no-fill': 'ad_no_fill',
    viewable: 'ad_viewable',
    error: 'ad_script_error',
    blocked: 'ad_blocked',
  }[detail.type];
  if (detail.type === 'rendered') {
    const shell = [...document.querySelectorAll('[data-ad-slot]')].find((item) => item.dataset.adSlot === detail.slot);
    if (shell) shell.dataset.adRendered = 'true';
  }
  if (eventName) send(eventName, { slot: detail.slot || 'all' });
});

window.mstudioAnalytics = Object.freeze({
  track(event, details) {
    if (EVENT_ALLOWLIST.has(event)) send(event, details);
  },
});

const EVENT_ALLOWLIST = new Set([
  'editor_open', 'render_success', 'render_error', 'export', 'copy_svg', 'share',
  'template_open', 'ad_request', 'ad_slot_view', 'ad_viewable', 'ad_rendered', 'ad_no_fill', 'ad_script_loaded', 'ad_script_error', 'ad_blocked',
]);

async function initialize() {
  try {
    const response = await fetch(CONFIG_ENDPOINT, { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) return;
    configuration = await response.json();
  } catch {
    return;
  }
  if (!configuration?.enabled || (configuration.respectDnt && privacyOptOut())) return;

  observeVitals();
  trackClicks();
  observeEditor();
  observeAdSlots();
  send('page_view');

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      visibleSince = performance.now();
    } else {
      visibleDuration();
    }
  });
  window.addEventListener('pagehide', () => {
    sendEngagement();
    sendVitals();
  });
  window.setInterval(() => {
    if (document.visibilityState === 'visible') {
      visibleDuration();
      visibleSince = performance.now();
      const seconds = Math.min(300, Math.round(engagementSeconds));
      if (seconds >= 30) {
        send('engagement', { seconds });
        engagementSeconds = 0;
      }
    }
  }, 30_000);
}

initialize();
