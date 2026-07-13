/** `serve` command: launch the local product site and editor. */

import open from 'open';
import { startServer } from '../server/app.js';
import { closeBrowser } from '../core/renderer.js';
import { log, c } from './log.js';

function portFrom(options) {
  const value = options.port ?? process.env.PORT ?? 4321;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid port: ${value}`);
  }
  return port;
}

export async function runServe(options) {
  const port = portFrom(options);
  const host = options.host || process.env.HOST || '127.0.0.1';

  let instance;
  try {
    instance = await startServer({ port, host });
  } catch (error) {
    if (error.code === 'EADDRINUSE') {
      throw new Error(`Port ${port} is already in use. Try: serve --port ${port + 1}`);
    }
    throw error;
  }

  const editorUrl = `${instance.url}/editor`;
  log.info('');
  log.info(`  ${c.magenta(c.bold('Mermaid Studio'))} ${c.dim('— Persian-first local diagram product')}`);
  log.info('');
  log.info(`  ${c.bold('➜')}  ${c.cyan(editorUrl)} ${c.dim('(editor)')}`);
  log.info(`  ${c.bold('➜')}  ${c.cyan(instance.url)} ${c.dim('(landing page)')}`);
  log.info(`  ${c.dim('Live preview · SVG/PNG/PDF export · strict safe mode')}`);
  log.info(`  ${c.dim('Press Ctrl+C to stop.')}`);
  log.info('');

  if (options.open !== false && process.env.NO_OPEN !== '1') {
    const freshEditorUrl = `${editorUrl}?v=${Date.now().toString(36)}`;
    open(freshEditorUrl).catch(() => log.warn(`Open your browser at ${editorUrl}`));
  }

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info('');
    log.step('serve', c.dim('shutting down…'));
    await closeBrowser();
    await instance.close();
    process.exit(0);
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  await new Promise(() => {});
}
