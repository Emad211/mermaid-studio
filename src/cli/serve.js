/** `serve` command: launch the local GUI and (optionally) open the browser. */

import open from 'open';
import { startServer } from '../server/app.js';
import { closeBrowser } from '../core/renderer.js';
import { log, c } from './log.js';

export async function runServe(options) {
  const port = options.port ? Number(options.port) : 4321;
  const host = options.host || '127.0.0.1';

  let srv;
  try {
    srv = await startServer({ port, host });
  } catch (err) {
    if (err.code === 'EADDRINUSE') {
      throw new Error(`Port ${port} is already in use. Try: serve --port ${port + 1}`);
    }
    throw err;
  }

  log.info('');
  log.info(`  ${c.magenta(c.bold('Mermaid Studio'))} ${c.dim('— local diagram editor')}`);
  log.info('');
  log.info(`  ${c.bold('➜')}  ${c.cyan(srv.url)}`);
  log.info(`  ${c.dim('Editor with live preview, themes, and SVG / PNG / PDF export.')}`);
  log.info(`  ${c.dim('Press Ctrl+C to stop.')}`);
  log.info('');

  if (options.open !== false) {
    // Open with a unique token so a previously-cached page is never reused.
    const fresh = `${srv.url}/?v=${Date.now().toString(36)}`;
    open(fresh).catch(() => log.warn(`Open your browser at ${srv.url}`));
  }

  const shutdown = async () => {
    log.info('');
    log.step('serve', c.dim('shutting down…'));
    await closeBrowser();
    await srv.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Keep alive forever.
  await new Promise(() => {});
}
