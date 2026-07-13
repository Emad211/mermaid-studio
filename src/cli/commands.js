/** Extra CLI commands: validate, info, init. */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { startServer } from '../server/app.js';
import { validateDiagram, closeBrowser, ChromeUnavailableError } from '../core/renderer.js';
import { THEMES, FORMATS, PDF_PAPERS, LAYOUTS, BACKGROUNDS } from '../shared/config.js';
import { log, c } from './log.js';

const require = createRequire(import.meta.url);
const pkg = require('../../package.json');

const ICON_PACKS = ['logos', 'mdi', 'fa6-solid', 'fa6-brands'];
const DIAGRAM_TYPES = [
  'flowchart', 'sequence', 'class', 'state', 'entity-relationship', 'user journey',
  'gantt', 'pie', 'quadrant', 'requirement', 'gitgraph', 'C4', 'mindmap', 'timeline',
  'sankey', 'xychart', 'block', 'packet', 'kanban', 'architecture', 'radar', 'zenuml',
];

/* ------------------------------------------------------------- validate */

export async function runValidate(rawInputs, options) {
  const inputs = [...(rawInputs || []), ...(options.input || [])];
  const files = [];
  for (const raw of inputs) {
    const p = path.resolve(raw);
    if (fs.existsSync(p) && fs.statSync(p).isFile()) files.push(p);
    else log.warn(`Skipping (not a file): ${raw}`);
  }
  if (files.length === 0) throw new Error('Pass one or more .mmd files to validate.');

  const srv = await startServer({ port: 0 });
  let bad = 0;
  try {
    for (const file of files) {
      const code = fs.readFileSync(file, 'utf8');
      const rel = path.relative(process.cwd(), file) || file;
      try {
        const res = await validateDiagram({ serverUrl: srv.url, code, theme: options.theme });
        if (res.valid) {
          log.ok(`${rel} ${c.dim('valid')}`);
        } else {
          bad++;
          log.error(`${rel}${res.line ? c.dim(` (line ${res.line})`) : ''}\n  ${res.message.split('\n').join('\n  ')}`);
        }
      } catch (err) {
        if (err instanceof ChromeUnavailableError) throw err;
        bad++;
        log.error(`${rel}: ${err.message}`);
      }
    }
  } finally {
    await closeBrowser();
    await srv.close();
  }
  if (bad > 0) {
    log.error(`\n${bad} of ${files.length} file(s) invalid.`);
    process.exitCode = 1;
  } else {
    log.info(c.green(`\nAll ${files.length} file(s) valid.`));
  }
}

/* ----------------------------------------------------------------- info */

export function runInfo() {
  const row = (label, items) => log.plain(`${c.bold(label.padEnd(14))} ${c.dim(items.join('  '))}`);
  log.plain(`${c.magenta(c.bold('Mermaid Studio'))} v${pkg.version}\n`);
  row('Formats', FORMATS);
  row('Themes', THEMES);
  row('Backgrounds', Object.keys(BACKGROUNDS));
  row('Layouts', LAYOUTS);
  row('PDF papers', PDF_PAPERS);
  row('Icon packs', ICON_PACKS);
  log.plain('');
  row('Diagrams', DIAGRAM_TYPES);
  log.plain(`\n${c.dim('Render:')} mermaid-studio render diagram.mmd -o out.png`);
  log.plain(`${c.dim('GUI:   ')} mermaid-studio serve`);
}

/* ----------------------------------------------------------------- init */

const STARTER_DIAGRAM = `flowchart TD
    A[Idea] --> B{Good?}
    B -- Yes --> C[Build it]
    B -- No  --> A
    C --> D[Ship 🚀]
`;

const STARTER_CONFIG = {
  theme: 'default',
  flowchart: { curve: 'basis' },
  themeVariables: { primaryColor: '#b16cea' },
};

export function runInit(options) {
  const dir = options.dir ? path.resolve(options.dir) : process.cwd();
  fs.mkdirSync(dir, { recursive: true });
  const writes = [
    ['diagram.mmd', STARTER_DIAGRAM],
    ['mermaid.config.json', JSON.stringify(STARTER_CONFIG, null, 2) + '\n'],
  ];
  for (const [name, content] of writes) {
    const target = path.join(dir, name);
    if (fs.existsSync(target) && !options.force) {
      log.warn(`Exists, skipping: ${name} ${c.dim('(use --force to overwrite)')}`);
      continue;
    }
    fs.writeFileSync(target, content);
    log.ok(`Created ${path.relative(process.cwd(), target) || name}`);
  }
  log.info(`\n${c.dim('Next:')} mermaid-studio render diagram.mmd -o diagram.png -c mermaid.config.json`);
  log.info(`${c.dim('  or:')} mermaid-studio serve`);
}
