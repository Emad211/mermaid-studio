import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../src/server/app.js';
import {
  createEditorAdFrameToken,
  verifyEditorAdFrameToken,
} from '../src/server/editor-ad-rollout.js';

const PASSWORD = 'security-test-password-0123456789';
const SECRET = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

function environment(directory) {
  return {
    NODE_ENV: 'production',
    SITE_URL: 'https://nemodara.ir',
    SITE_NAME: 'نمودارا',
    HOST: '127.0.0.1',
    TRUST_PROXY: 'true',
    ANALYTICS_ENABLED: 'true',
    ANALYTICS_DATA_DIR: directory,
    ANALYTICS_TIME_ZONE: 'UTC',
    ANALYTICS_ADMIN_USER: 'admin',
    ANALYTICS_ADMIN_PASSWORD: PASSWORD,
    ANALYTICS_HASH_SECRET: SECRET,
    ADS_ENABLED: 'true',
    ADS_PUBLISHER_VALIDATED: 'true',
    ADS_PROVIDER: 'yektanet',
    ADS_SCRIPT_URL: 'https://cdn.yektanet.com/rg_woebegone/scripts_v3/test/rg.complete.js',
    ADS_SCRIPT_ID: 'ua-script-security-test',
    ADS_ALLOWED_ORIGINS: 'https://cdn.yektanet.com,https://*.yektanet.com',
    ADS_SLOT_HOME_INLINE: 'pos-home-inline-test',
    ADS_EDITOR_ENABLED: 'true',
    ADS_EDITOR_REQUIRE_CROSS_ORIGIN: 'true',
    ADS_EDITOR_FRAME_ORIGIN: 'https://ads.nemodara.ir',
    ADS_EDITOR_TOKEN_TTL_SECONDS: '60',
    ADS_EDITOR_TRAFFIC_PERCENT: '100',
    ADS_EDITOR_LOAD_DELAY_MS: '0',
    ADS_SLOT_EDITOR_RAIL: 'pos-editor-rail-test',
    ADS_SLOT_EDITOR_DOCK: 'pos-editor-dock-test',
    RENDER_GET_ENABLED: 'false',
    GSC_ENABLED: 'false',
    INDEXNOW_ENABLED: 'false',
  };
}

const basic = () => `Basic ${Buffer.from(`admin:${PASSWORD}`).toString('base64')}`;

function request(server, pathname, { host = 'nemodara.ir', method = 'GET', headers = {}, body = '' } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: server.port,
      path: pathname,
      method,
      headers: { Host: host, Accept: 'application/json,text/html', ...headers },
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'nemodara-security-'));
  const env = environment(directory);
  const server = await startServer({ port: 0, host: '127.0.0.1', environment: env, logger: { error() {} } });
  t.after(async () => {
    await server.close();
    await fs.rm(directory, { recursive: true, force: true });
  });
  return { server, env };
}

test('production rollout cookie uses the __Host prefix and secure attributes', async (t) => {
  const { server } = await fixture(t);
  const response = await request(server, '/editor');
  assert.equal(response.status, 200);
  const cookies = Array.isArray(response.headers['set-cookie'])
    ? response.headers['set-cookie']
    : [response.headers['set-cookie']].filter(Boolean);
  const cookie = cookies.find((value) => String(value).startsWith('__Host-nemodara_editor_ads_bucket='));
  assert.ok(cookie, 'Expected the secure editor rollout cookie to be present.');
  assert.match(cookie, /__Host-nemodara_editor_ads_bucket=\d{1,2}/);
  assert.match(cookie || '', /Secure/);
  assert.match(cookie || '', /HttpOnly/);
  assert.match(cookie || '', /SameSite=Lax/);
  assert.doesNotMatch(cookie || '', /Domain=/i);
});

test('editor frame tokens are bound to slot, audience and expiry', () => {
  const env = environment('/tmp/unused');
  const now = Date.now();
  const token = createEditorAdFrameToken('editorRail', env, now);
  assert.equal(verifyEditorAdFrameToken(token, 'editorRail', env, now + 30_000), true);
  assert.equal(verifyEditorAdFrameToken(token, 'editorDock', env, now + 30_000), false);
  assert.equal(verifyEditorAdFrameToken(token, 'editorRail', { ...env, ADS_EDITOR_FRAME_ORIGIN: 'https://other.example' }, now), false);
  assert.equal(verifyEditorAdFrameToken(token, 'editorRail', env, now + 61_000), false);
});

test('isolated ad frame rejects direct navigation and accepts a valid iframe request', async (t) => {
  const { server } = await fixture(t);
  const configResponse = await request(server, '/api/ads');
  assert.equal(configResponse.status, 200);
  const token = JSON.parse(configResponse.body).editor.frameTokens.editorRail;
  assert.ok(token);

  const direct = await request(server, `/ads/editor-frame?slot=editorRail&token=${encodeURIComponent(token)}`, {
    host: 'ads.nemodara.ir',
    headers: { 'Sec-Fetch-Dest': 'document', 'Sec-Fetch-Site': 'none' },
  });
  assert.equal(direct.status, 403);

  const missing = await request(server, '/ads/editor-frame?slot=editorRail', {
    host: 'ads.nemodara.ir',
    headers: {
      'Sec-Fetch-Dest': 'iframe',
      'Sec-Fetch-Site': 'same-site',
      Referer: 'https://nemodara.ir/editor',
    },
  });
  assert.equal(missing.status, 403);

  const embedded = await request(server, `/ads/editor-frame?slot=editorRail&token=${encodeURIComponent(token)}`, {
    host: 'ads.nemodara.ir',
    headers: {
      'Sec-Fetch-Dest': 'iframe',
      'Sec-Fetch-Site': 'same-site',
      Referer: 'https://nemodara.ir/editor',
    },
  });
  assert.equal(embedded.status, 200);
  assert.match(embedded.body, /pos-editor-rail-test/);
  assert.match(embedded.headers['content-security-policy'] || '', /frame-ancestors[^;]*https:\/\/nemodara\.ir/);
});

test('public health is minimal while operational health is authenticated', async (t) => {
  const { server } = await fixture(t);
  const publicHealth = await request(server, '/api/health');
  assert.equal(publicHealth.status, 200);
  assert.deepEqual(Object.keys(JSON.parse(publicHealth.body)).sort(), ['ok', 'version']);

  const anonymous = await request(server, '/api/admin/health');
  assert.equal(anonymous.status, 401);
  const admin = await request(server, '/api/admin/health', { headers: { Authorization: basic() } });
  assert.equal(admin.status, 200);
  const data = JSON.parse(admin.body);
  assert.equal(data.ok, true);
  assert.ok(data.analytics);
  assert.ok(data.render);
});

test('production GET rendering is disabled and POST remains the supported path', async (t) => {
  const { server } = await fixture(t);
  const response = await request(server, '/api/render?code=flowchart%20TD%3B%20A--%3EB&format=svg');
  assert.equal(response.status, 405);
  assert.match(response.body, /RENDER_GET_DISABLED/);
});

test('admin mutations and analytics ingestion reject cross-site requests', async (t) => {
  const { server } = await fixture(t);
  const revenue = await request(server, '/api/admin/analytics/revenue', {
    method: 'POST',
    headers: {
      Authorization: basic(),
      Origin: 'https://evil.example',
      'Sec-Fetch-Site': 'cross-site',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ entries: [] }),
  });
  assert.equal(revenue.status, 403);

  const analytics = await request(server, '/api/analytics/event', {
    method: 'POST',
    headers: {
      Origin: 'https://evil.example',
      'Sec-Fetch-Site': 'cross-site',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ event: 'page_view', session: 'cross-site', path: '/' }),
  });
  assert.equal(analytics.status, 403);
});

test('public content is CDN-cacheable while editor remains private and publisher-free', async (t) => {
  const { server } = await fixture(t);
  const landing = await request(server, '/');
  assert.equal(landing.status, 200);
  assert.match(landing.headers['cache-control'] || '', /s-maxage=300/);

  const editor = await request(server, '/editor');
  assert.equal(editor.status, 200);
  assert.match(editor.headers['cache-control'] || '', /no-store/);
  assert.match(editor.headers.vary || '', /Cookie/i);
  assert.doesNotMatch(editor.body, /cdn\.yektanet\.com/);
  assert.doesNotMatch(editor.headers['content-security-policy'] || '', /script-src[^;]*cdn\.yektanet\.com/);
  assert.match(editor.headers['content-security-policy'] || '', /frame-src[^;]*https:\/\/ads\.nemodara\.ir/);
});
