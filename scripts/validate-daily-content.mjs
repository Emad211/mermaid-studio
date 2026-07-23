#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { startServer } from '../src/server/app.js';
import { closeBrowser } from '../src/core/renderer.js';
import { loadEntries } from './publish-daily-content.mjs';

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

function validateTemplateLinks(entry) {
  const expectedTutorial = `/learn/${entry.tutorial.slug}`;
  const expectedArticle = `/articles/${entry.article.slug}`;
  if (entry.template.tutorial !== expectedTutorial) {
    throw new Error(`template:${entry.template.id} tutorial link must be ${expectedTutorial}`);
  }
  if (entry.template.article !== expectedArticle) {
    throw new Error(`template:${entry.template.id} article link must be ${expectedArticle}`);
  }
}

async function main() {
  process.env.PUPPETEER_NO_SANDBOX = process.env.PUPPETEER_NO_SANDBOX || 'true';
  const entries = await loadEntries();
  entries.forEach(validateTemplateLinks);
  const samples = entries.flatMap(collectCode);
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
    PUPPETEER_NO_SANDBOX: process.env.PUPPETEER_NO_SANDBOX,
    // The production API deliberately has a low public rate limit. This local
    // validator renders the entire trusted content inventory in one process, so
    // its limit must scale with the number of checked examples instead of
    // failing as the editorial library grows.
    RENDER_RATE_MAX: String(Math.max(100, samples.length + 10)),
    RENDER_RATE_WINDOW_MS: '60000',
  };

  const server = await startServer({
    port: 0,
    host: '127.0.0.1',
    environment,
    logger: { error() {}, warn() {}, info() {} },
  });

  const results = [];
  try {
    for (const sample of samples) {
      process.stdout.write(`Validating ${sample.label}...\n`);
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
  } finally {
    await server.close();
    await closeBrowser();
    await fs.rm(dataDir, { recursive: true, force: true });
  }

  process.stdout.write(`Validated ${results.length} Mermaid examples and ${entries.length} template link pairs.\n`);
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
