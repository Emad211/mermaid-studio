import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const port = 4876;
const base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['bin/cli.js', 'serve', '--host', '127.0.0.1', '--port', String(port), '--no-open'], {
  cwd: new URL('..', import.meta.url),
  env: {
    ...process.env,
    NODE_ENV: 'production',
    NO_OPEN: '1',
    ADS_ENABLED: 'false',
    ANALYTICS_ENABLED: 'false',
    SITE_URL: 'https://diagram.example.com',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let output = '';
child.stdout.on('data', (chunk) => { output += chunk; });
child.stderr.on('data', (chunk) => { output += chunk; });

async function waitForHealth() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`${base}/api/health`);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Production server did not become healthy.\n${output}`);
}

try {
  await waitForHealth();
  for (const route of ['/', '/editor', '/templates', '/learn', '/learn/flowchart-mermaid', '/privacy', '/terms']) {
    const response = await fetch(base + route, { redirect: 'manual' });
    assert.equal(response.status, 200, `${route} must return 200`);
    assert.match(response.headers.get('content-type') || '', /text\/html/);
  }

  const root = await (await fetch(`${base}/`)).text();
  assert.match(root, /rel="canonical" href="https:\/\/diagram\.example\.com\/"/);
  assert.match(root, /SoftwareApplication/);

  const sitemap = await fetch(`${base}/sitemap.xml`);
  assert.equal(sitemap.status, 200);
  assert.match(await sitemap.text(), /\/learn\/mermaid-errors/);

  const analytics = await (await fetch(`${base}/api/analytics/config`)).json();
  assert.equal(analytics.enabled, false);

  const ads = await (await fetch(`${base}/api/ads`)).json();
  assert.equal(ads.enabled, false, 'ads must be disabled without publisher credentials');

  const render = await fetch(`${base}/api/render`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: 'flowchart TD; A-->B', format: 'svg' }),
  });
  assert.equal(render.status, 200, 'server-side SVG render must work');
  assert.match(render.headers.get('content-type') || '', /image\/svg\+xml/);
  console.log('Production smoke test passed.');
} finally {
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
  if (child.exitCode === null) child.kill('SIGKILL');
}
