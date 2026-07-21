#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { startServer } from '../src/server/app.js';
import { closeBrowser } from '../src/core/renderer.js';
import { validateEntry } from './publish-daily-content.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CONTENT_DIR = path.join(ROOT, 'content', 'daily');

function collectCode(entry) {
  return [
    { label: `template:${entry.template.id}`, code: entry.template.code },
    ...entry.article.sections
      .filter((section) => section.code)
      .map((section) => ({ label: `article:${entry.article.slug}#${section.id}`, code: section.code })),
    ...entry.tutorial.sections
      .filter((section) => section.code)
      .map((section) => ({ label: `tutorial:${entry.tutorial.slug}#${section.id}`, code: section.code })),
  ];
}

async function loadEntries() {
  const names = (await fs.readdir(CONTENT_DIR)).filter((name) => name.endsWith('.json')).sort();
  return Promise.all(names.map(async (name) => {
    const entry = JSON.parse(await fs.readFile(path.join(CONTENT_DIR, name), 'utf8'));
    return validateEntry(entry, name);
  }));
}

async function main() {
  const entries = await loadEntries();
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nemodara-daily-content-'));
  const environment = {
    ...process.env,
    NODE_ENV: 'test',
    SITE_URL: 'https://nemodara.ir',
    SITE_NAME: 'نمودارا',
    ANALYTICS_ENABLED: 'false',
    ANALYTICS_DATA_DIR: dataDir,
    ADS_ENABLED: 'false',
    GSC_ENABLED: 'false',
    INDEXNOW_ENABLED: 'false',
    PUPPETEER_NO_SANDBOX: process.env.PUPPETEER_NO_SANDBOX || 'true',
  };

  const server = await startServer({
    port: 0,
    host: '127.0.0.1',
    environment,
    logger: { error() {}, warn() {}, info() {} },
  });

  const results = [];
  try {
    for (const entry of entries) {
      for (const sample of collectCode(entry)) {
        const response = await fetch(`${server.url}/api/render`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            code: sample.code,
            format: 'svg',
            theme: 'default',
            background: 'white',
          }),
        });
        if (!response.ok) {
          const detail = await response.text();
          throw new Error(`${sample.label} failed Mermaid validation (${response.status}): ${detail.slice(0, 500)}`);
        }
        const svg = await response.text();
        if (!svg.includes('<svg')) throw new Error(`${sample.label} did not return SVG`);
        results.push(sample.label);
      }
    }
  } finally {
    await server.close();
    await closeBrowser();
    await fs.rm(dataDir, { recursive: true, force: true });
  }

  process.stdout.write(`Validated ${results.length} Mermaid examples.\n`);
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
