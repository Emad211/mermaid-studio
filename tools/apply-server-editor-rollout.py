#!/usr/bin/env python3
from pathlib import Path

path = Path('src/server/app.js')
text = path.read_text(encoding='utf-8')


def replace_once(old: str, new: str) -> None:
    global text
    if old not in text:
        raise SystemExit(f'Editor rollout anchor not found: {old[:160]!r}')
    text = text.replace(old, new, 1)


replace_once(
    "import { buildLaunchReadiness } from './launch-readiness.js';",
    "import { buildLaunchReadiness } from './launch-readiness.js';\nimport { editorAdRollout } from './editor-ad-rollout.js';",
)

replace_once(
    """function prepareHtml(req, source, { pathname = req.path, seo = true, track = true } = {}, state) {
  let html = applySiteShell(source, pathname).split('%V%').join(BUILD);
""",
    """function prepareHtml(req, source, { pathname = req.path, seo = true, track = true, editorAdsEligible = true } = {}, state) {
  let html = applySiteShell(source, pathname).split('%V%').join(BUILD);
""",
)

replace_once(
    "  if (advertisingAllowed(pathname) || pathname === '/editor') html = prepareAdvertisingHtml(html, state.environment);",
    "  if (advertisingAllowed(pathname) || pathname === '/editor') html = prepareAdvertisingHtml(html, state.environment, { editorEligible: editorAdsEligible });",
)

replace_once(
    "  app.get('/editor', (req, res) => sendHtml(req, res, EDITOR_HTML, { pathname: '/editor' }, state));",
    """  app.get('/editor', (req, res) => {
    const rollout = editorAdRollout(req, res, advertisingConfig(environment), environment);
    return sendHtml(req, res, EDITOR_HTML, { pathname: '/editor', editorAdsEligible: rollout.eligible }, state);
  });""",
)

path.write_text(text, encoding='utf-8')
print('Server-side editor advertising rollout applied.')
