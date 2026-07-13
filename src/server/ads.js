/** Configuration helpers for Iranian publisher ad networks. */

const PROVIDERS = new Set(['yektanet', 'tapsell']);

const SLOT_ENV = Object.freeze({
  homeTop: 'ADS_SLOT_HOME_TOP',
  homeInline: 'ADS_SLOT_HOME_INLINE',
  templatesTop: 'ADS_SLOT_TEMPLATES_TOP',
  templatesInline: 'ADS_SLOT_TEMPLATES_INLINE',
  learnTop: 'ADS_SLOT_LEARN_TOP',
  learnInline: 'ADS_SLOT_LEARN_INLINE',
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

  // CSP supports wildcard subdomains, although URL does not parse them.
  if (/^https:\/\/\*\.[a-z0-9.-]+(?::\d{2,5})?$/i.test(source)) return source;

  try {
    const url = new URL(source);
    if (url.protocol !== 'https:' || url.username || url.password) return '';
    return url.origin;
  } catch {
    return '';
  }
}

/**
 * Public, non-secret ad configuration exposed to the browser.
 * Nothing is loaded unless ADS_ENABLED, a supported provider, a valid HTTPS
 * script URL and at least one placement ID are all present.
 */
export function advertisingConfig(environment = process.env) {
  const provider = String(environment.ADS_PROVIDER || '').trim().toLowerCase();
  const scriptUrl = safeScriptUrl(environment.ADS_SCRIPT_URL);
  const slots = Object.fromEntries(
    Object.entries(SLOT_ENV).map(([name, envName]) => [name, safeDomId(environment[envName])]),
  );
  const hasPlacement = Object.values(slots).some(Boolean);
  const enabled = Boolean(
    booleanValue(environment.ADS_ENABLED) &&
      PROVIDERS.has(provider) &&
      scriptUrl &&
      hasPlacement,
  );

  return {
    enabled,
    provider: PROVIDERS.has(provider) ? provider : null,
    scriptUrl: enabled ? scriptUrl : null,
    scriptId: safeDomId(environment.ADS_SCRIPT_ID) || `mstudio-${provider || 'ads'}-script`,
    loadDelayMs: integerValue(environment.ADS_LOAD_DELAY_MS, 700, 0, 10_000),
    slots,
    privacyUrl: '/privacy#advertising',
  };
}

/** Origins/patterns that must be admitted by the site's CSP when ads are on. */
export function advertisingCspSources(environment = process.env) {
  const config = advertisingConfig(environment);
  if (!config.enabled) return [];

  const values = [
    config.scriptUrl,
    ...String(environment.ADS_ALLOWED_ORIGINS || '')
      .split(',')
      .map((item) => item.trim()),
  ];

  return [...new Set(values.map(safeCspSource).filter(Boolean))];
}

export { PROVIDERS, SLOT_ENV };
