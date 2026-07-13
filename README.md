# Mermaid Studio

A **fully-local, do-everything** tool for [Mermaid](https://github.com/mermaid-js/mermaid)
diagrams. Turn Mermaid code into **SVG / PNG / JPG / WebP / PDF** through a powerful
**CLI** or a polished **web GUI** with live preview — completely offline.

Mermaid, the editor, icon packs, the ELK layout engine and KaTeX are all served from
your machine; rendering uses the headless Chromium that Puppeteer installs locally.
The GUI preview and the CLI/PDF export run the **exact same** Mermaid build and
pipeline, so what you see is what you get.

---

## 🇮🇷 شروع سریع (فارسی)

```powershell
npm install        # یک‌بار — وابستگی‌ها + موتور رندر را آماده می‌کند
npm run serve      # رابط گرافیکی را در مرورگر باز می‌کند
# یا از خط فرمان:
node bin/cli.js render diagram.mmd -o out.png
```

- **رابط گرافیکی**: ویرایشگر با هایلایت سینتکس + پیش‌نمایش زنده + تغییر تم/چیدمان + خروجی
  SVG/PNG/JPG/WebP/PDF + پنل تنظیمات (Config و CSS) + باز/ذخیره فایل + لینک اشتراک‌گذاری +
  آیکون‌پک‌ها + چیدمان ELK + فرمول ریاضی + تمام‌صفحه + بزرگ‌نمایی و جابه‌جایی.
- **خط فرمان**: یک فایل، چند فایل، گلاب بازگشتی (`**`)، پوشه، stdin، استخراج از Markdown،
  حالت `--watch`، اجرای موازی، و دستورهای `validate` / `info` / `init`.
- همه‌چیز **آفلاین و محلی**.

---

## Requirements

- **Node.js ≥ 18** (tested on Node 20)
- ~150 MB for the Chromium Puppeteer downloads on `npm install` (needed for raster/PDF
  export; the GUI live preview works without it).

## Install

```bash
npm install
```

This installs Mermaid, CodeMirror, KaTeX, the icon packs, pako and Puppeteer, then
runs a one-time build that bundles the ELK layout engine for the browser
(`npm run build` re-runs it).

---

## The GUI

```bash
npm run serve            # → http://127.0.0.1:4321 (opens automatically)
node bin/cli.js serve -p 8080
node bin/cli.js serve --no-open
```

| Area | Features |
|---|---|
| **Editor** | CodeMirror with Mermaid highlighting, line numbers, bracket matching, word-wrap toggle, font-size control |
| **Live preview** | re-renders ~220 ms after you type · detected diagram type shown as a chip |
| **Themes / layout** | `default` · `neutral` · `dark` · `forest` · `base` · layout engine `dagre` / **`elk`** |
| **Backgrounds** | transparent (checkerboard) · white · dark · **any custom color** |
| **Pan & zoom** | scroll to zoom, drag to pan, **Fit** / **1:1**, **fullscreen**, auto-fit toggle |
| **Export…** | dialog for **SVG / PNG / JPG / WebP / PDF**, scale, quality, background, PDF paper/orientation/fit |
| **Quick export** | one-click **SVG / PNG**, **Copy SVG**, **Copy image** to clipboard |
| **Files** | **Open** (button or drag-&-drop), **Save** `.mmd`, **New** |
| **Share** | **copy a shareable link** (diagram + settings compressed into the URL) |
| **Settings drawer** | live **Config (JSON)** editor (themeVariables, per-diagram options) and **Custom CSS** |
| **Power features** | icon packs, ELK layout, KaTeX math — all rendered inline |
| **Quality of life** | light/dark UI, persistent state, keyboard shortcuts (`?` for help) |

### Keyboard shortcuts

`Ctrl/⌘+S` SVG · `Ctrl/⌘+E` export dialog · `Ctrl/⌘+O` open · `Ctrl/⌘+K` share ·
`Ctrl/⌘+0` fit · `F` fullscreen · `?` help · `Esc` close.

---

## The CLI

```bash
node bin/cli.js render [inputs...] [options]
```

(`render` is the default command, so `node bin/cli.js diagram.mmd -o out.png` works too.)

### Options

| Flag | Description | Default |
|------|-------------|---------|
| `-i, --input <path>` | add an input (repeatable) | — |
| `-o, --output <path>` | output file, **directory** (batch), or `-` (stdout) | next to input |
| `-f, --format <fmt>` | `svg` `png` `jpg` `jpeg` `webp` `pdf` | from `-o` ext, else `svg` |
| `-t, --theme <name>` | `default` `neutral` `dark` `forest` `base` | `default` |
| `-b, --background <c>` | `transparent` `white` `dark` or any CSS color | `white` |
| `-l, --layout <engine>` | `dagre` `elk` | `dagre` |
| `-s, --scale <n>` | raster pixel-density multiplier (1–5) | `2` |
| `-Q, --quality <n>` | JPEG/WebP quality (1–100) | `92` |
| `-w, --width <px>` | explicit width (vector resize) | auto |
| `-H, --height <px>` | explicit height | auto |
| `-c, --config <file>` | Mermaid config JSON (themeVariables, per-diagram, …) | — |
| `-C, --css <file>` | custom CSS injected into the diagram | — |
| `--pdf-paper <size>` | `auto` `a3` `a4` `a5` `letter` `legal` `tabloid` | `auto` |
| `--pdf-landscape` | landscape orientation | off |
| `--pdf-fit` | scale diagram to one PDF page width | off |
| `-j, --concurrency <n>` | render N diagrams in parallel | `1` |
| `--watch` | re-render on file change | off |
| `-q, --quiet` | suppress progress output | off |

### Other commands

```bash
node bin/cli.js validate diagram.mmd      # lint syntax (exit 1 on error); alias: lint
node bin/cli.js info                        # list formats, themes, layouts, diagram types
node bin/cli.js init                        # scaffold diagram.mmd + mermaid.config.json
node bin/cli.js serve                       # start the GUI
npm test                                    # run the full test suite
```

### Examples

```bash
node bin/cli.js render diagram.mmd -o out.png
node bin/cli.js render diagram.mmd -o out.pdf -t dark -b transparent
node bin/cli.js render diagram.mmd -o out.webp -Q 80
node bin/cli.js render flow.mmd -o flow.pdf --pdf-paper a4 --pdf-landscape --pdf-fit
node bin/cli.js render diagram.mmd -o out.svg -l elk          # ELK layout
node bin/cli.js render "src/**/*.mmd" -o build/ -f png -j 4    # recursive batch, parallel
node bin/cli.js render diagrams/ -o build/ --watch
node bin/cli.js render README.md -o build/                     # one image per ```mermaid block
node bin/cli.js render diagram.mmd -o - -f svg > out.svg       # stdout
Get-Content flow.mmd | node bin/cli.js render - -o flow.png    # stdin (PowerShell)
```

---

## HTTP API

The server (`serve`) exposes a small API so you can embed or script rendering:

```
POST /api/render        body: { code, format, theme, layout, background, scale,
                                 quality, width, height, config, css, pdfPaper,
                                 pdfLandscape, pdfFit }  → image/pdf bytes
GET  /api/render?format=svg&code=<urlencoded>           → for <img src="…">
GET  /api/render?format=png&encoding=base64&code=<b64>
GET  /api/meta          themes, formats, papers, layouts, examples, icon packs
GET  /api/version
```

Embed a live diagram anywhere:

```html
<img src="http://127.0.0.1:4321/api/render?format=svg&theme=dark&code=flowchart%20TD%3BA--%3EB" />
```

---

## Supported diagram types

Everything Mermaid 11 supports: flowchart, sequence, class, state, ER, user journey,
gantt, pie, quadrant, requirement, gitgraph, C4, mindmap, timeline, sankey, xychart,
block, packet, kanban, **architecture (with icon packs)**, radar, zenuml — plus
**KaTeX math** and the **ELK** layout engine. See [`examples/`](examples/) (also in the
GUI's **Load** menu).

### Icon packs

`logos`, `mdi`, `fa6-solid`, `fa6-brands` are bundled and lazily loaded. Use them in
architecture diagrams and icon shapes, e.g. `service db(logos:aws-rds)[Database]`.

---

## How it works

```
   CLI ─────────►  Express server (127.0.0.1)
   GUI (browser)►    /            editor + live preview (client-side Mermaid)
                     /headless    Puppeteer renders here (CLI + PDF/raster)
                     /vendor/*    mermaid · codemirror · katex · pako · iconify
                     /vendor-build  ELK bundle
                     /api/render  SVG / PNG / JPG / WebP / PDF
                            │ drives
                            ▼
                  Headless Chromium → mermaid.render() → <svg> → screenshot / pdf
```

## Project structure

```
bin/cli.js                  CLI entry point
scripts/build-vendor.mjs    bundles ELK for the browser (esbuild)
tests/run.mjs               test suite (npm test)
src/
  cli/      index.js         commander setup
            render.js        single / batch / glob / stdin / markdown / watch / stdout
            commands.js      validate · info · init
            serve.js         GUI launcher
            log.js           tiny colored logger
  core/     renderer.js      Puppeteer → SVG/PNG/JPG/WebP/PDF + validate
  server/   app.js           Express app + API
  shared/   config.js        formats, themes, papers, layouts, defaults
            examples.js      the example gallery
public/                     the GUI (index.html, css, js) + headless.html + vendor-build
examples/                   sample .mmd files
```

---

## Troubleshooting

**"Could not launch headless Chromium"** — install the local browser:

```bash
npx puppeteer browsers install chrome
```

or point at an existing one:

```powershell
$env:PUPPETEER_EXECUTABLE_PATH = "C:\Program Files\Google\Chrome\Application\chrome.exe"
```

The **GUI live preview works without Chromium** (it renders in your browser); only
raster/PDF export and the CLI need it.

**Port already in use** — `node bin/cli.js serve -p 4322`.

## License

MIT
