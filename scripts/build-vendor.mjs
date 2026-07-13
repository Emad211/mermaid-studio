/**
 * Bundle browser-only vendored modules that can't be served raw because they
 * use bare import specifiers (e.g. ELK layout → d3 + elkjs). esbuild inlines
 * everything into a single self-contained ESM file the browser can import.
 *
 * Run automatically on `npm install` (postinstall) and via `npm run build`.
 */

import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'public', 'vendor-build');

fs.mkdirSync(OUT_DIR, { recursive: true });

const targets = [
  {
    name: 'ELK layout',
    stdin: "export { default } from '@mermaid-js/layout-elk';",
    outfile: path.join(OUT_DIR, 'layout-elk.mjs'),
  },
];

let built = 0;
for (const t of targets) {
  try {
    await build({
      stdin: { contents: t.stdin, resolveDir: ROOT, loader: 'js' },
      bundle: true,
      format: 'esm',
      platform: 'browser',
      target: 'es2020',
      minify: true,
      outfile: t.outfile,
      legalComments: 'none',
      logLevel: 'error',
    });
    const kb = (fs.statSync(t.outfile).size / 1024).toFixed(0);
    console.log(`  ✔ ${t.name} → ${path.relative(ROOT, t.outfile)} (${kb} KB)`);
    built++;
  } catch (err) {
    console.warn(`  ! Skipped ${t.name}: ${err.message}`);
  }
}

console.log(`Vendor build complete (${built}/${targets.length}).`);
