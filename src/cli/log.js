/** Minimal zero-dependency colored logger that respects NO_COLOR and --quiet. */

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;

const wrap = (open, close) => (s) => (useColor ? `[${open}m${s}[${close}m` : String(s));

export const c = {
  bold: wrap(1, 22),
  dim: wrap(2, 22),
  red: wrap(31, 39),
  green: wrap(32, 39),
  yellow: wrap(33, 39),
  blue: wrap(34, 39),
  cyan: wrap(36, 39),
  magenta: wrap(35, 39),
};

let quiet = false;
export function setQuiet(v) {
  quiet = !!v;
}

export const log = {
  info: (...a) => !quiet && console.error(...a),
  step: (label, msg) => !quiet && console.error(`${c.cyan('•')} ${c.bold(label)} ${msg ?? ''}`.trimEnd()),
  ok: (msg) => !quiet && console.error(`${c.green('✔')} ${msg}`),
  warn: (msg) => console.error(`${c.yellow('!')} ${msg}`),
  error: (msg) => console.error(`${c.red('✖')} ${msg}`),
  plain: (...a) => console.log(...a),
};
