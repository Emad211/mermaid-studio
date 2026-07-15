/** Configuration helpers for Iranian publisher ad networks. */

const PROVIDERS = new Set(['yektanet', 'tapsell']);

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

export function advertisingConfig(environment = process.env) {
  const provider = String(environment.ADS_PROVIDER || '').trim().toLowerCase();
  const scriptUrl = safeScriptUrl(environment.ADS_SCRIPT_URL);
  const slots = Object.fromEntries(Object.entries(SLOT_ENV).map(([name, envName]) => [name, safeDomId(environment[envName])]));
  const hasPlacement = Object.values(slots).some(Boolean);
  const enabled = Boolean(booleanValue(environment.ADS_ENABLED) && PROVIDERS.has(provider) && scriptUrl && hasPlacement);
  return {
    enabled,
    provider: PROVIDERS.has(provider) ? provider : null,
    scriptUrl: enabled ? scriptUrl : null,
    scriptId: safeDomId(environment.ADS_SCRIPT_ID) || `nemodara-${provider || 'ads'}-script`,
    loadDelayMs: integerValue(environment.ADS_LOAD_DELAY_MS, 700, 0, 10_000),
    slots,
    slotMeta: SLOT_META,
    privacyUrl: '/privacy#advertising',
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

export { PROVIDERS, SLOT_ENV, SLOT_META };
