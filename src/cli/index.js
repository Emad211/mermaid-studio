/** Command-line interface for Mermaid Studio (built on commander). */

import { Command } from 'commander';
import { createRequire } from 'node:module';
import { runRender } from './render.js';
import { runServe } from './serve.js';
import { runValidate, runInfo, runInit } from './commands.js';
import { setQuiet, log, c } from './log.js';
import { THEMES, FORMATS, PDF_PAPERS, LAYOUTS, DEFAULTS } from '../shared/config.js';
import { ChromeUnavailableError } from '../core/renderer.js';

const require = createRequire(import.meta.url);
const pkg = require('../../package.json');

function collect(value, previous) {
  return [...(previous || []), value];
}

export function buildProgram() {
  const program = new Command();

  program
    .name('mermaid-studio')
    .description(
      `${c.magenta('Mermaid Studio')} — render Mermaid diagrams locally to SVG / PNG / JPG / WEBP / PDF,\n` +
        'from the command line or a friendly web GUI. Supports icon packs, ELK layout and math.'
    )
    .version(pkg.version, '-v, --version')
    .showHelpAfterError();

  program
    .command('render', { isDefault: true })
    .description('Render Mermaid source file(s) to an image or PDF')
    .argument('[inputs...]', 'input files, directories, globs (incl. **), or "-" for stdin')
    .option('-i, --input <path>', 'add an input (repeatable)', collect, [])
    .option('-o, --output <path>', 'output file (single), directory (batch), or "-" for stdout')
    .option('-f, --format <fmt>', `format: ${FORMATS.join(' | ')} (default: from -o extension or svg)`)
    .option('-t, --theme <name>', `mermaid theme: ${THEMES.join(' | ')}`, DEFAULTS.theme)
    .option('-b, --background <color>', 'transparent | white | dark | any CSS color', DEFAULTS.background)
    .option('-l, --layout <engine>', `layout engine: ${LAYOUTS.join(' | ')}`, DEFAULTS.layout)
    .option('-s, --scale <n>', 'raster pixel-density multiplier (1–5)', String(DEFAULTS.scale))
    .option('-Q, --quality <n>', 'JPEG/WebP quality (1–100)', String(DEFAULTS.quality))
    .option('-w, --width <px>', 'explicit diagram width in px (vector resize)')
    .option('-H, --height <px>', 'explicit diagram height in px')
    .option('-c, --config <file>', 'mermaid config JSON (themeVariables, per-diagram, …)')
    .option('-C, --css <file>', 'custom CSS injected into the diagram')
    .option('--pdf-paper <size>', `PDF paper: ${PDF_PAPERS.join(' | ')}`, DEFAULTS.pdfPaper)
    .option('--pdf-landscape', 'PDF landscape orientation', false)
    .option('--pdf-fit', 'scale the diagram to fit one PDF page width', false)
    .option('-j, --concurrency <n>', 'render up to N diagrams in parallel', '1')
    .option('--watch', 're-render whenever an input file changes', false)
    .option('-q, --quiet', 'suppress progress output', false)
    .addHelpText(
      'after',
      `
Examples:
  $ mermaid-studio render diagram.mmd -o out.png
  $ mermaid-studio render diagram.mmd -o out.pdf -t dark -b transparent
  $ mermaid-studio render diagram.mmd -o out.webp -Q 80
  $ mermaid-studio render flow.mmd -o flow.pdf --pdf-paper a4 --pdf-landscape --pdf-fit
  $ mermaid-studio render diagram.mmd -o out.svg -l elk
  $ mermaid-studio render "src/**/*.mmd" -o build/ -f png -j 4
  $ mermaid-studio render diagrams/ -o build/ --watch
  $ mermaid-studio render diagram.mmd -o - -f svg > out.svg
  $ Get-Content flow.mmd | mermaid-studio render - -o flow.png
`
    )
    .action(async (inputs, options) => {
      setQuiet(options.quiet);
      await runRender(inputs, options);
    });

  program
    .command('serve')
    .description('Start the local web GUI (live preview + export)')
    .option('-p, --port <n>', 'port to listen on', '4321')
    .option('--host <host>', 'host/interface to bind', '127.0.0.1')
    .option('--no-open', 'do not open the GUI in a browser (it opens by default)')
    .action(async (options) => {
      await runServe(options);
    });

  program
    .command('validate')
    .alias('lint')
    .description('Check Mermaid file(s) for syntax errors without rendering')
    .argument('[inputs...]', 'files to validate')
    .option('-i, --input <path>', 'add an input (repeatable)', collect, [])
    .option('-t, --theme <name>', 'theme to validate against', DEFAULTS.theme)
    .action(async (inputs, options) => {
      await runValidate(inputs, options);
    });

  program
    .command('info')
    .description('List supported formats, themes, layouts and diagram types')
    .action(() => runInfo());

  program
    .command('init')
    .description('Scaffold a starter diagram.mmd and mermaid.config.json')
    .option('-d, --dir <path>', 'directory to scaffold into', '.')
    .option('--force', 'overwrite existing files', false)
    .action((options) => runInit(options));

  return program;
}

export async function main(argv = process.argv) {
  const program = buildProgram();
  try {
    await program.parseAsync(argv);
  } catch (err) {
    if (err instanceof ChromeUnavailableError) log.error(err.message);
    else log.error(err.message || String(err));
    process.exit(1);
  }
}
