/**
 * Self-contained test suite. Boots a local server, then renders/validates
 * across every format and feature. Run with `npm test`.
 */

import { startServer } from '../src/server/app.js';
import { renderDiagram, validateDiagram, closeBrowser } from '../src/core/renderer.js';
import { EXAMPLES } from '../src/shared/examples.js';

let pass = 0;
let fail = 0;
function assert(name, cond) {
  if (cond) {
    pass++;
    console.log('  \x1b[32m✓\x1b[0m ' + name);
  } else {
    fail++;
    console.error('  \x1b[31m✗\x1b[0m ' + name);
  }
}
function section(title) {
  console.log('\n\x1b[1m' + title + '\x1b[0m');
}

const magic = {
  svg: (b) => b.toString('utf8', 0, 400).includes('<svg'),
  png: (b) => b[0] === 0x89 && b.toString('latin1', 1, 4) === 'PNG',
  jpg: (b) => b[0] === 0xff && b[1] === 0xd8,
  jpeg: (b) => b[0] === 0xff && b[1] === 0xd8,
  webp: (b) => b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP',
  pdf: (b) => b.toString('latin1', 0, 5) === '%PDF-',
};

const srv = await startServer({ port: 0 });
const url = srv.url;
const R = (opts) => renderDiagram({ serverUrl: url, ...opts });

try {
  section('Output formats');
  for (const fmt of ['svg', 'png', 'jpg', 'webp', 'pdf']) {
    const r = await R({ code: 'flowchart TD; A-->B', format: fmt });
    assert(`render ${fmt}`, magic[fmt](r.buffer) && r.buffer.length > 100);
  }

  section('Themes');
  for (const theme of ['default', 'neutral', 'dark', 'forest', 'base']) {
    const r = await R({ code: 'flowchart TD; A-->B', format: 'svg', theme });
    assert(`theme ${theme}`, magic.svg(r.buffer));
  }

  section('Backgrounds & scale');
  {
    const t = await R({ code: 'flowchart TD; A-->B', format: 'png', background: 'transparent' });
    assert('transparent png', magic.png(t.buffer));
    const big = await R({ code: 'flowchart TD; A-->B', format: 'png', scale: 4 });
    const small = await R({ code: 'flowchart TD; A-->B', format: 'png', scale: 1 });
    assert('scale increases size', big.buffer.length > small.buffer.length);
    const custom = await R({ code: 'flowchart TD; A-->B', format: 'png', background: '#ffeedd' });
    assert('custom bg color', magic.png(custom.buffer));
  }

  section('PDF paper options');
  {
    const a4 = await R({ code: 'flowchart LR; A-->B-->C', format: 'pdf', pdfPaper: 'a4', pdfLandscape: true, pdfFit: true });
    assert('pdf a4 landscape fit', magic.pdf(a4.buffer));
    const auto = await R({ code: 'flowchart TD; A-->B', format: 'pdf', pdfPaper: 'auto' });
    assert('pdf auto', magic.pdf(auto.buffer));
  }

  section('Advanced features');
  {
    const elk = await R({ code: 'flowchart TD; A-->B; A-->C; B-->D; C-->D', format: 'svg', layout: 'elk' });
    assert('ELK layout', magic.svg(elk.buffer));
    const css = await R({ code: 'flowchart TD; A-->B', format: 'svg', css: '.node rect{fill:#abcdef}' });
    assert('custom CSS injected', css.buffer.toString().includes('abcdef'));
    const cfg = await R({ code: 'flowchart TD; A-->B', format: 'svg', config: { themeVariables: { primaryColor: '#123456' } } });
    assert('config themeVariables', magic.svg(cfg.buffer));
    const icons = await R({ code: 'architecture-beta\n  group g(logos:aws)[Cloud]\n  service s(logos:aws-rds)[DB] in g', format: 'svg' });
    assert('icon packs', icons.buffer.toString().includes('</svg>') && (icons.buffer.toString().match(/<path/g) || []).length > 2);
    const math = await R({ code: 'flowchart TD; A["$$x^2$$"]-->B', format: 'svg' });
    assert('KaTeX math', math.buffer.toString().includes('katex'));
    const sized = await R({ code: 'flowchart TD; A-->B', format: 'svg', width: 900 });
    assert('width resize', /width="9\d\d"/.test(sized.buffer.toString()) || sized.width >= 880);
  }

  section('Every example renders');
  for (const ex of EXAMPLES) {
    try {
      const r = await R({ code: ex.code, format: 'svg' });
      assert(`example: ${ex.id}`, r.buffer.toString().includes('</svg>'));
    } catch (e) {
      assert(`example: ${ex.id}`, false);
      console.error('    ' + e.message.split('\n')[0]);
    }
  }

  section('Validation');
  {
    const good = await validateDiagram({ serverUrl: url, code: 'flowchart TD; A-->B' });
    assert('valid diagram passes', good.valid === true);
    const bad = await validateDiagram({ serverUrl: url, code: 'flowchart TD; A--> (((' });
    assert('invalid diagram fails', bad.valid === false && !!bad.message);
  }

  section('HTTP API');
  {
    const post = await fetch(url + '/api/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'flowchart TD; A-->B', format: 'png', scale: 2 }),
    });
    const pbuf = Buffer.from(await post.arrayBuffer());
    assert('POST /api/render png', post.ok && magic.png(pbuf) && post.headers.get('content-type') === 'image/png');

    const get = await fetch(url + '/api/render?format=svg&code=' + encodeURIComponent('flowchart TD; A-->B'));
    assert('GET /api/render svg (embed)', get.ok && magic.svg(Buffer.from(await get.arrayBuffer())));

    const b64 = Buffer.from('flowchart TD; X-->Y').toString('base64');
    const getb = await fetch(url + '/api/render?format=png&encoding=base64&code=' + encodeURIComponent(b64));
    assert('GET /api/render base64 png', getb.ok && magic.png(Buffer.from(await getb.arrayBuffer())));

    const meta = await (await fetch(url + '/api/meta')).json();
    assert('GET /api/meta', Array.isArray(meta.themes) && Array.isArray(meta.formats) && meta.examples.length > 0);

    const errResp = await fetch(url + '/api/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'flowchart TD; A--> (((', format: 'svg' }),
    });
    assert('invalid code → 422', errResp.status === 422);
  }
} finally {
  await closeBrowser();
  await srv.close();
}

console.log(`\n${fail === 0 ? '\x1b[32m' : '\x1b[31m'}${pass} passed, ${fail} failed\x1b[0m`);
process.exit(fail ? 1 : 0);
