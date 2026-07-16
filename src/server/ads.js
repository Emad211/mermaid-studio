/** Configuration helpers for Iranian publisher ad networks. */

const PROVIDERS = new Set(['yektanet', 'tapsell']);
const EDITOR_SLOTS = new Set(['editorRail', 'editorDock']);

const SLOT_ENV = Object.freeze({
  homeTop: 'ADS_SLOT_HOME_TOP',
  homeInline: 'ADS_SLOT_HOME_INLINE',
  templatesTop: 'ADS_SLOT_TEMPLATES_TOP',
  templatesInline: 'ADS_SLOT_TEMPLATES_INLINE',
  learnTop: 'ADS_SLOT_LEARN_TOP',
  learnInline: 'ADS_SLOT_LEARN_INLINE',
  learnFeed: 'ADS_SLOT_LEARN_FEED',
  articlesTop: 'ADS_SLOT_ARTICLES_TOP',
  articlesInline: 'ADS_SLOT_ARTICLES_INLINE',
  articleTop: 'ADS_SLOT_ARTICLE_TOP',
  articleMid: 'ADS_SLOT_ARTICLE_MID',
  articleEnd: 'ADS_SLOT_ARTICLE_END',
  editorRail: 'ADS_SLOT_EDITOR_RAIL',
  editorDock: 'ADS_SLOT_EDITOR_DOCK',
});

const SLOT_META = Object.freeze({
  homeTop: { format: 'leaderboard', desktop: 132, mobile: 112 },
  homeInline: { format: 'native', desktop: 178, mobile: 206 },
  templatesTop: { format: 'leaderboard', desktop: 122, mobile: 108 },
  templatesInline: { format: 'native', desktop: 178, mobile: 206 },
  learnTop: { format: 'leaderboard', desktop: 122, mobile: 108 },
  learnInline: { format: 'article', desktop: 154, mobile: 180 },
  learnFeed: { format: 'native', desktop: 184, mobile: 214 },
  articlesTop: { format: 'leaderboard', desktop: 122, mobile: 108 },
  articlesInline: { format: 'native', desktop: 184, mobile: 214 },
  articleTop: { format: 'article', desktop: 142, mobile: 174 },
  articleMid: { format: 'article', desktop: 154, mobile: 184 },
  articleEnd: { format: 'article', desktop: 154, mobile: 184 },
  editorRail: { format: 'rail', desktop: 620, mobile: 0 },
  editorDock: { format: 'leaderboard', desktop: 112, mobile: 96 },
});

function booleanValue(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function integerValue(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function safeScriptUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password) return '';
    return url.href;
  } catch {
    return '';
  }
}

function safeOrigin(value, { httpsOnly = true } = {}) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (httpsOnly && url.protocol !== 'https:') return '';
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return '';
    return url.origin;
  } catch {
    return '';
  }
}

function safeDomId(value) {
  const id = String(value || '').trim();
  if (!id || id.length > 180 || !/^[A-Za-z][A-Za-z0-9_:.-]*$/.test(id)) return '';
  return id;
}

function safeCspSource(value) {
  const source = String(value || '').trim();
  if (!source) return '';
  if (/^https:\/\/\*\.[a-z0-9.-]+(?::\d{2,5})?$/i.test(source)) return source;
  try {
    const url = new URL(source);
    if (url.protocol !== 'https:' || url.username || url.password) return '';
    return url.origin;
  } catch {
    return '';
  }
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function inlineJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
}

export function advertisingConfig(environment = process.env) {
  const provider = String(environment.ADS_PROVIDER || '').trim().toLowerCase();
  const scriptUrl = safeScriptUrl(environment.ADS_SCRIPT_URL);
  const rawSlots = Object.fromEntries(Object.entries(SLOT_ENV).map(([name, envName]) => [name, safeDomId(environment[envName])]));
  const production = environment.NODE_ENV === 'production';
  const siteOrigin = safeOrigin(environment.SITE_URL, { httpsOnly: production });
  const frameOrigin = safeOrigin(environment.ADS_EDITOR_FRAME_ORIGIN, { httpsOnly: production });
  const editorRequested = booleanValue(environment.ADS_EDITOR_ENABLED, false);
  const requireCrossOrigin = booleanValue(environment.ADS_EDITOR_REQUIRE_CROSS_ORIGIN, production);
  const trafficPercent = integerValue(environment.ADS_EDITOR_TRAFFIC_PERCENT, 100, 0, 100);
  const editorLoadDelayMs = integerValue(environment.ADS_EDITOR_LOAD_DELAY_MS, 1_800, 0, 30_000);
  const isolationReady = Boolean(frameOrigin && (!requireCrossOrigin || !siteOrigin || frameOrigin !== siteOrigin));

  const slots = { ...rawSlots };
  if (!editorRequested || !isolationReady || trafficPercent <= 0) {
    slots.editorRail = '';
    slots.editorDock = '';
  }

  const hasPlacement = Object.values(slots).some(Boolean);
  const enabled = Boolean(booleanValue(environment.ADS_ENABLED) && PROVIDERS.has(provider) && scriptUrl && hasPlacement);
  const editorHasPlacement = Boolean(slots.editorRail || slots.editorDock);
  const editorEnabled = Boolean(enabled && editorRequested && isolationReady && editorHasPlacement && trafficPercent > 0);

  return {
    enabled,
    provider: PROVIDERS.has(provider) ? provider : null,
    scriptUrl: enabled ? scriptUrl : null,
    scriptId: safeDomId(environment.ADS_SCRIPT_ID) || `nemodara-${provider || 'ads'}-script`,
    loadDelayMs: integerValue(environment.ADS_LOAD_DELAY_MS, 700, 0, 10_000),
    slots,
    slotMeta: SLOT_META,
    privacyUrl: '/privacy#advertising',
    editor: {
      requested: editorRequested,
      enabled: editorEnabled,
      frameOrigin: isolationReady ? frameOrigin : null,
      framePath: '/ads/editor-frame',
      requireCrossOrigin,
      isolationReady,
      trafficPercent,
      loadDelayMs: editorLoadDelayMs,
    },
  };
}

export function advertisingCspSources(environment = process.env) {
  const config = advertisingConfig(environment);
  if (!config.enabled) return [];
  const values = [
    config.scriptUrl,
    ...String(environment.ADS_ALLOWED_ORIGINS || '').split(',').map((item) => item.trim()),
  ];
  return [...new Set(values.map(safeCspSource).filter(Boolean))];
}

export function editorFrameCspSources(environment = process.env) {
  const config = advertisingConfig(environment);
  if (!config.editor.enabled || !config.editor.frameOrigin) return [];
  return [config.editor.frameOrigin];
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Unhides only configured placements while HTML is still on the server. This
 * reserves the final slot height before first paint and avoids ad-induced CLS.
 */
export function prepareAdvertisingHtml(input, environment = process.env) {
  const config = advertisingConfig(environment);
  if (!config.enabled) return String(input);
  let html = String(input);
  for (const [name, placement] of Object.entries(config.slots)) {
    if (!placement) continue;
    const meta = config.slotMeta[name] || { format: 'native', desktop: 160, mobile: 190 };
    const pattern = new RegExp(`(<(?:aside|div)\\b[^>]*\\bdata-ad-slot=["']${escapeRegex(name)}["'][^>]*)(>)`, 'i');
    html = html.replace(pattern, (_match, rawTag, close) => {
      let tag = rawTag.replace(/\s+hidden(?=\s|$)/i, '');
      if (!/\bdata-ad-state=/.test(tag)) tag += ' data-ad-state="reserved"';
      if (!/\bdata-ad-format=/.test(tag)) tag += ` data-ad-format="${meta.format}"`;
      const style = `--ad-min-desktop:${meta.desktop}px;--ad-min-mobile:${meta.mobile}px`;
      if (/\bstyle=["']/.test(tag)) tag = tag.replace(/\bstyle=(["'])([^"']*)\1/i, (_s, quote, value) => `style=${quote}${value};${style}${quote}`);
      else tag += ` style="${style}"`;
      return tag + close;
    });
  }
  return html;
}

/**
 * Minimal advertising document used only inside the editor iframe. When
 * ADS_EDITOR_FRAME_ORIGIN is a separate origin (recommended: ads.nemodara.ir),
 * the publisher script cannot read the parent editor DOM or Mermaid source.
 */
export function renderEditorAdFrame(slotName, environment = process.env) {
  const slot = String(slotName || '');
  const config = advertisingConfig(environment);
  if (!config.editor.enabled || !EDITOR_SLOTS.has(slot) || !config.slots[slot]) return null;

  const placementId = config.slots[slot];
  const payload = {
    source: 'nemodara-editor-ad',
    slot,
    provider: config.provider,
    scriptUrl: config.scriptUrl,
    scriptId: `${config.scriptId}-${slot}`.slice(0, 180),
    placementId,
  };

  return `<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="robots" content="noindex,nofollow,noarchive" />
  <meta name="referrer" content="origin" />
  <title>تبلیغات نمودارا</title>
  <style>
    *{box-sizing:border-box}html,body{width:100%;height:100%;margin:0;overflow:hidden;background:transparent;color:#6f7a72;font-family:Tahoma,Arial,sans-serif}body{display:grid;place-items:stretch}.placement{width:100%;height:100%;min-height:48px;display:grid;place-items:center}.placement:empty::before{content:'در حال دریافت تبلیغ…';font-size:10px;color:#7d877f}.placement[data-ready='true']::before{content:none}
  </style>
</head>
<body>
  <div id="${escapeHtml(placementId)}" class="placement" data-provider="${escapeHtml(config.provider)}"></div>
  <script>
    (() => {
      const config = ${inlineJson(payload)};
      const report = (type) => parent.postMessage({ source: config.source, slot: config.slot, type }, '*');
      const mount = document.getElementById(config.placementId);
      if (config.provider === 'yektanet') {
        window.yektanetAnalyticsObject = window.yektanetAnalyticsObject || 'yektanet';
        const objectName = window.yektanetAnalyticsObject;
        if (typeof window[objectName] !== 'function') {
          const queue = function (...args) { queue.q.push(args); };
          queue.q = [];
          window[objectName] = queue;
        }
      }
      try {
        const script = document.createElement('script');
        script.id = config.scriptId;
        const url = new URL(config.scriptUrl, location.href);
        if (config.provider === 'yektanet' && !url.searchParams.has('v')) {
          const now = new Date();
          url.searchParams.set('v', [now.getFullYear(), now.getMonth(), now.getDate(), now.getHours()].join(''));
          script.dataset.analyticsobject = window.yektanetAnalyticsObject;
        }
        script.src = url.href;
        script.async = true;
        script.referrerPolicy = 'origin';
        script.addEventListener('load', () => {
          mount.dataset.ready = 'true';
          report('loaded');
        }, { once: true });
        script.addEventListener('error', () => report(navigator.onLine ? 'blocked' : 'error'), { once: true });
        document.head.appendChild(script);
      } catch {
        report('error');
      }
    })();
  </script>
</body>
</html>`;
}

export { PROVIDERS, SLOT_ENV, SLOT_META, EDITOR_SLOTS };
