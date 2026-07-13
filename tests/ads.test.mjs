import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { advertisingConfig, advertisingCspSources } from '../src/server/ads.js';

test('advertising is disabled unless every required value exists', () => {
  assert.equal(advertisingConfig({}).enabled, false);
  assert.equal(advertisingConfig({ ADS_ENABLED: 'true', ADS_PROVIDER: 'yektanet' }).enabled, false);
  assert.equal(
    advertisingConfig({
      ADS_ENABLED: 'true',
      ADS_PROVIDER: 'yektanet',
      ADS_SCRIPT_URL: 'http://cdn.example.com/ads.js',
      ADS_SLOT_HOME_TOP: 'pos-home',
    }).enabled,
    false,
  );
});

test('valid Yektanet-style configuration exposes only public placement data', () => {
  const config = advertisingConfig({
    ADS_ENABLED: 'true',
    ADS_PROVIDER: 'yektanet',
    ADS_SCRIPT_URL: 'https://cdn.yektanet.example/path/rg.complete.js?publisher=demo',
    ADS_SCRIPT_ID: 'ua-script-demo',
    ADS_LOAD_DELAY_MS: '900',
    ADS_SLOT_HOME_TOP: 'pos-article-display-card-100',
    ADS_SLOT_LEARN_INLINE: 'pos-article-display-card-200',
  });

  assert.equal(config.enabled, true);
  assert.equal(config.provider, 'yektanet');
  assert.equal(config.scriptId, 'ua-script-demo');
  assert.equal(config.loadDelayMs, 900);
  assert.equal(config.slots.homeTop, 'pos-article-display-card-100');
  assert.equal(config.slots.learnInline, 'pos-article-display-card-200');
  assert.equal(config.slots.templatesTop, '');
  assert.equal(config.privacyUrl, '/privacy#advertising');
});

test('invalid provider or unsafe placement ID cannot enable ads', () => {
  const base = {
    ADS_ENABLED: 'true',
    ADS_SCRIPT_URL: 'https://cdn.example.com/ads.js',
    ADS_SLOT_HOME_TOP: 'pos-home',
  };
  assert.equal(advertisingConfig({ ...base, ADS_PROVIDER: 'unknown' }).enabled, false);
  assert.equal(
    advertisingConfig({
      ...base,
      ADS_PROVIDER: 'tapsell',
      ADS_SLOT_HOME_TOP: '<script>alert(1)</script>',
    }).enabled,
    false,
  );
});

test('CSP origins are normalized, deduplicated and restricted to HTTPS', () => {
  const sources = advertisingCspSources({
    ADS_ENABLED: 'true',
    ADS_PROVIDER: 'yektanet',
    ADS_SCRIPT_URL: 'https://cdn.example.com/path/ads.js',
    ADS_SLOT_HOME_INLINE: 'pos-home-inline',
    ADS_ALLOWED_ORIGINS:
      'https://cdn.example.com, https://*.example.com, http://unsafe.example, javascript:alert(1)',
  });

  assert.deepEqual(sources, ['https://cdn.example.com', 'https://*.example.com']);
});


test('browser loader keeps the Yektanet bootstrap contract and editor is not an ad slot', async () => {
  const browserSource = await readFile(new URL('../public/js/ads.js', import.meta.url), 'utf8');
  const serverSource = await readFile(new URL('../src/server/ads.js', import.meta.url), 'utf8');
  assert.match(browserSource, /yektanetAnalyticsObject/);
  assert.match(browserSource, /dataset\.analyticsobject/);
  assert.match(browserSource, /data-ad-slot/);
  assert.doesNotMatch(serverSource, /ADS_SLOT_EDITOR/);
});
