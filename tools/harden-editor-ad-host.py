#!/usr/bin/env python3
from pathlib import Path

path = Path('src/server/app.js')
text = path.read_text(encoding='utf-8')


def replace_once(old: str, new: str) -> None:
    global text
    if old not in text:
        raise SystemExit(f'Host hardening anchor not found: {old[:140]!r}')
    text = text.replace(old, new, 1)


replace_once(
    """  if (envBoolean(environment, 'TRUST_PROXY')) app.set('trust proxy', 1);
  app.use(securityHeaders(environment));

""",
    """  if (envBoolean(environment, 'TRUST_PROXY')) app.set('trust proxy', 1);
  app.use(securityHeaders(environment));

  const editorAdvertising = advertisingConfig(environment);
  const primarySiteOrigin = safeHttpsOrigin(environment.SITE_URL);
  let editorFrameHostname = '';
  try {
    editorFrameHostname = new URL(editorAdvertising.editor.frameOrigin || '').hostname.toLowerCase();
  } catch {
    editorFrameHostname = '';
  }
  if (editorFrameHostname) {
    app.use((req, res, next) => {
      const requestHostname = String(req.hostname || '').toLowerCase();
      if (requestHostname !== editorFrameHostname) return next();
      if (req.path === '/ads/editor-frame' || req.path === '/api/health') return next();
      if (['GET', 'HEAD'].includes(req.method) && primarySiteOrigin) {
        return res.redirect(302, `${primarySiteOrigin}${req.originalUrl}`);
      }
      return next(new HttpError(404, 'EDITOR_AD_HOST_ROUTE_NOT_FOUND', 'This host only serves the isolated advertising frame.'));
    });
  }

""",
)

replace_once(
    """  app.get('/ads/editor-frame', (req, res, next) => {
    try {
      const html = renderEditorAdFrame(req.query.slot, environment);
""",
    """  app.get('/ads/editor-frame', (req, res, next) => {
    try {
      const config = advertisingConfig(environment);
      if (environment.NODE_ENV === 'production' && config.editor.frameOrigin) {
        const expectedHostname = new URL(config.editor.frameOrigin).hostname.toLowerCase();
        if (String(req.hostname || '').toLowerCase() !== expectedHostname) {
          throw new HttpError(404, 'EDITOR_AD_FRAME_HOST_MISMATCH', 'The advertising frame is only available on its configured host.');
        }
      }
      const html = renderEditorAdFrame(req.query.slot, environment);
""",
)

path.write_text(text, encoding='utf-8')
print('Editor advertising host hardening applied.')
