#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path.cwd()


def write(relative: str, content: str) -> None:
    path = ROOT / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content.strip() + "\n", encoding="utf-8")


write(
    "compose.yaml",
    r'''
name: mermaid-studio

services:
  app:
    build:
      context: .
    image: mermaid-studio:latest
    restart: unless-stopped
    env_file:
      - .env
    environment:
      NODE_ENV: production
      HOST: 0.0.0.0
      PORT: 4321
      NO_OPEN: 1
    expose:
      - "4321"
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:4321/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
      interval: 30s
      timeout: 6s
      start_period: 30s
      retries: 4
    init: true
    read_only: true
    tmpfs:
      - /tmp:size=1073741824,mode=1777
    shm_size: 1gb

  caddy:
    image: caddy:2.8-alpine
    restart: unless-stopped
    depends_on:
      app:
        condition: service_healthy
    environment:
      DOMAIN: ${DOMAIN:-localhost}
    ports:
      - "80:80"
      - "443:443"
      - "443:443/udp"
    volumes:
      - ./deploy/Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config

volumes:
  caddy_data:
  caddy_config:
''',
)

write(
    "deploy/Caddyfile",
    r'''
{$DOMAIN:localhost} {
  encode zstd gzip

  @static path /css/* /js/* /vendor/* /vendor-build/* /logo.svg /manifest.webmanifest
  header @static Cache-Control "public, max-age=86400"

  reverse_proxy app:4321 {
    health_uri /api/health
    health_interval 30s
    health_timeout 5s
  }

  header {
    -Server
  }
}
''',
)

write(
    "scripts/smoke-production.mjs",
    r'''
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const port = 4876;
const base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['bin/cli.js', 'serve', '--host', '127.0.0.1', '--port', String(port), '--no-open'], {
  cwd: new URL('..', import.meta.url),
  env: { ...process.env, NODE_ENV: 'production', NO_OPEN: '1', ADS_ENABLED: 'false' },
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
  for (const route of ['/', '/editor', '/templates', '/learn', '/privacy', '/terms']) {
    const response = await fetch(base + route, { redirect: 'manual' });
    assert.equal(response.status, 200, `${route} must return 200`);
    assert.match(response.headers.get('content-type') || '', /text\/html/);
  }

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
''',
)

write(
    "docs/PRODUCTION_CHECKLIST_FA.md",
    r'''
# چک‌لیست نهایی انتشار Mermaid Studio

## قبل از انتشار

- یک دامنه و سرور دارای Docker تهیه کنید.
- `.env.example` را به `.env` کپی و مقادیر production را تنظیم کنید.
- `DOMAIN` را روی دامنهٔ واقعی قرار دهید.
- `TRUST_PROXY=true` را فقط وقتی فعال کنید که Caddy یا reverse proxy مورد اعتماد جلوی برنامه است.
- حالت `PUPPETEER_NO_SANDBOX` را ابتدا `false` نگه دارید؛ فقط در میزبان‌هایی که sandbox Chromium را پشتیبانی نمی‌کنند و پس از اعمال ایزولاسیون کانتینر، آن را فعال کنید.

## تبلیغات

- ابتدا سایت را با `ADS_ENABLED=false` منتشر کنید.
- دامنه را در پنل ناشر یکتانت یا تپسل ثبت و تأیید کنید.
- URL اسکریپت، شناسهٔ اسکریپت، originهای مجاز و شناسهٔ هر جایگاه را دقیقاً از پنل کپی کنید.
- سپس `ADS_ENABLED=true` را فعال کنید.
- با DevTools بررسی کنید هیچ اسکریپت تبلیغاتی در `/editor` یا `/headless` بارگذاری نمی‌شود.
- روی تبلیغات خودتان کلیک نکنید و از ایجاد ترافیک یا کلیک مصنوعی خودداری کنید.

## اجرای production

```bash
cp .env.example .env
docker compose build --pull
docker compose up -d
docker compose ps
curl -fsS https://YOUR_DOMAIN/api/health
```

Caddy به‌صورت خودکار HTTPS را برای دامنهٔ معتبر دریافت می‌کند. پورت‌های ۸۰ و ۴۴۳ باید از اینترنت در دسترس باشند.

## کنترل پس از انتشار

- صفحه‌های `/`، `/editor`، `/templates`، `/learn`، `/privacy` و `/terms` با کد ۲۰۰ باز شوند.
- `/api/health` مقدار `ok: true` برگرداند.
- یک خروجی SVG و یک PDF آزمایشی ساخته شود.
- هدر CSP در ادیتور فقط منابع first-party را مجاز کند.
- لاگ‌ها شامل بدنهٔ درخواست یا کد Mermaid کاربران نباشند.
- مصرف RAM، CPU، طول صف رندر و خطاهای 429/503 پایش شوند.

## پشتیبان‌گیری و بازگشت

برنامه پایگاه داده ندارد؛ بنابراین نسخهٔ Docker image، فایل `.env` و تنظیمات Caddy دارایی‌های اصلی استقرار هستند. برای بازگشت، image قبلی را اجرا و تنظیمات `.env` همان نسخه را بازیابی کنید.
''',
)

package_path = ROOT / "package.json"
package = json.loads(package_path.read_text(encoding="utf-8"))
package["version"] = "1.3.0"
package["description"] = "A free Persian-first Mermaid studio funded exclusively by privacy-conscious publisher advertising."
package.setdefault("scripts", {})["smoke:production"] = "node scripts/smoke-production.mjs"
package_path.write_text(json.dumps(package, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

lock_path = ROOT / "package-lock.json"
lock = json.loads(lock_path.read_text(encoding="utf-8"))
lock["version"] = "1.3.0"
if "" in lock.get("packages", {}):
    lock["packages"][""]["version"] = "1.3.0"
lock_path.write_text(json.dumps(lock, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

dockerfile = ROOT / "Dockerfile"
source = dockerfile.read_text(encoding="utf-8")
needle = "    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium"
replacement = needle + " \\\n    HOME=/tmp \\\n    XDG_CACHE_HOME=/tmp \\\n    XDG_CONFIG_HOME=/tmp"
if "XDG_CACHE_HOME=/tmp" not in source:
    if needle not in source:
        raise SystemExit("Dockerfile environment block did not match")
    source = source.replace(needle, replacement, 1)
dockerfile.write_text(source, encoding="utf-8")

readme = ROOT / "README_FA.md"
text = readme.read_text(encoding="utf-8")
marker = "## استقرار روی سرور\n"
addition = """## انتشار نهایی با Docker Compose

برای اجرای production همراه با HTTPS خودکار:

```bash
cp .env.example .env
docker compose build --pull
docker compose up -d
```

چک‌لیست کامل در [`docs/PRODUCTION_CHECKLIST_FA.md`](docs/PRODUCTION_CHECKLIST_FA.md) قرار دارد.

"""
if addition not in text:
    if marker not in text:
        raise SystemExit("README deployment marker did not match")
    text = text.replace(marker, addition + marker, 1)
readme.write_text(text, encoding="utf-8")

write(
    ".github/workflows/ci.yml",
    r'''
name: CI

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 25
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run build
      - run: npm test
      - run: npm run smoke:production

  container:
    needs: test
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
      - name: Build production image
        run: docker build --pull --tag mermaid-studio:ci .
      - name: Smoke-test production container
        shell: bash
        run: |
          set -euo pipefail
          docker run -d --name mermaid-studio-ci -p 127.0.0.1:4321:4321 mermaid-studio:ci
          trap 'docker logs mermaid-studio-ci || true; docker rm -f mermaid-studio-ci >/dev/null 2>&1 || true' EXIT
          for attempt in $(seq 1 80); do
            if curl -fsS http://127.0.0.1:4321/api/health >/dev/null; then break; fi
            sleep 1
          done
          curl -fsS http://127.0.0.1:4321/api/health
          curl -fsS http://127.0.0.1:4321/ >/dev/null
          curl -fsS http://127.0.0.1:4321/editor >/dev/null
          curl -fsS http://127.0.0.1:4321/learn >/dev/null
          curl -fsS -X POST http://127.0.0.1:4321/api/render \
            -H 'content-type: application/json' \
            --data '{"code":"flowchart TD; A-->B","format":"svg"}' \
            --output /tmp/diagram.svg
          grep -q '<svg' /tmp/diagram.svg
''',
)

print("Deployment assets finalized.")
