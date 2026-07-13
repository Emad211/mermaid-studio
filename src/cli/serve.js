/** `serve` command: launch the local GUI and optionally open the editor. */

import open from 'open';
import { startServer } from '../server/app.js';
import { closeBrowser } from '../core/renderer.js';
import { log, c } from './log.js';

function validPort(value, fallback) {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port <= 65_535 ? port : fallback;
}

export async function runServe(options) {
  const port = validPort(options.port ?? process.env.PORT, 4321);
  const production = process.env.NODE_ENV === 'production';
  const host = options.host || process.env.HOST || (production ? '0.0.0.0' : '127.0.0.1');

  let srv;
  try {
    srv = await startServer({ port, host });
  } catch (error) {
    if (error.code === 'EADDRINUSE') {
      throw new Error(`Port ${port} is already in use. Try: serve --port ${port + 1}`);
    }
    throw error;
  }

  log.info('');
  log.info(`  ${c.magenta(c.bold('Mermaid Studio'))} ${c.dim('— Persian diagram studio')}`);
  log.info('');
  log.info(`  ${c.bold('➜')}  ${c.cyan(srv.url)}`);
  log.info(`  ${c.dim('Landing page + editor with SVG / PNG / PDF export.')}`);
  log.info(`  ${c.dim('Press Ctrl+C to stop.')}`);
  log.info('');

  if (options.open !== false && !production) {
    const fresh = `${srv.url}/editor?v=${Date.now().toString(36)}`;
    open(fresh).catch(() => log.warn(`Open your browser at ${srv.url}/editor`));
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

  await new Promise(() => {});
}
