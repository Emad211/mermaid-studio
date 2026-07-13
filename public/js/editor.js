/**
 * Editor abstraction. Uses CodeMirror 5 (vendored, offline) when available and
 * transparently falls back to a plain <textarea> if it fails to load — so the
 * GUI always works.
 */

const DIAGRAM_KEYWORDS =
  'flowchart|graph|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|' +
  'journey|gantt|pie|quadrantChart|requirementDiagram|gitGraph|mindmap|timeline|' +
  'C4Context|C4Container|C4Component|sankey(?:-beta)?|xychart(?:-beta)?|block(?:-beta)?|' +
  'packet(?:-beta)?|kanban|architecture(?:-beta)?|zenuml|radar';

const STATEMENT_KEYWORDS =
  'subgraph|end|participant|actor|loop|alt|else|opt|par|and|rect|note|over|of|' +
  'activate|deactivate|class|state|section|title|dateFormat|axisFormat|branch|' +
  'checkout|merge|commit|direction|click|style|classDef|linkStyle';

function defineMermaidMode(CodeMirror) {
  if (CodeMirror.modes && CodeMirror.modes.mermaid) return;
  if (typeof CodeMirror.defineSimpleMode !== 'function') return;
  CodeMirror.defineSimpleMode('mermaid', {
    start: [
      { regex: /%%.*$/, token: 'comment' },
      { regex: /"(?:[^\\"]|\\.)*"?/, token: 'string' },
      { regex: new RegExp('\\b(?:' + DIAGRAM_KEYWORDS + ')\\b'), token: 'keyword' },
      { regex: new RegExp('\\b(?:' + STATEMENT_KEYWORDS + ')\\b'), token: 'def' },
      { regex: /[-.=]{1,3}[->ox|]+|[<>|ox]?[-.=]{1,3}/, token: 'operator' },
      { regex: /\b\d+(?:\.\d+)?\b/, token: 'number' },
      { regex: /[{}[\]()]/, token: 'bracket' },
    ],
    meta: { lineComment: '%%' },
  });
}

export function createEditor(textarea, { onChange, value = '' } = {}) {
  const CM = window.CodeMirror;

  if (CM && typeof CM.fromTextArea === 'function') {
    try {
      defineMermaidMode(CM);
      const cm = CM.fromTextArea(textarea, {
        mode: 'mermaid',
        theme: 'mstudio',
        lineNumbers: true,
        lineWrapping: false,
        indentUnit: 2,
        tabSize: 2,
        smartIndent: true,
        autoCloseBrackets: typeof CM.defineOption === 'function',
        matchBrackets: true,
        extraKeys: {
          Tab: (editor) => editor.replaceSelection('  '),
        },
      });
      cm.setValue(value);
      let timer = null;
      cm.on('change', () => {
        clearTimeout(timer);
        timer = setTimeout(() => onChange && onChange(cm.getValue()), 220);
      });
      return {
        kind: 'codemirror',
        getValue: () => cm.getValue(),
        setValue: (v) => cm.setValue(v),
        focus: () => cm.focus(),
        cursor: () => {
          const p = cm.getCursor();
          return { line: p.line + 1, col: p.ch + 1 };
        },
        onCursor: (cb) => cm.on('cursorActivity', () => cb()),
        refresh: () => cm.refresh(),
        setWrap: (v) => cm.setOption('lineWrapping', !!v),
        setFontSize: (px) => {
          cm.getWrapperElement().style.fontSize = `${px}px`;
          cm.refresh();
        },
      };
    } catch (err) {
      console.warn('CodeMirror failed, using textarea:', err);
    }
  }

  // Fallback: enhanced textarea.
  textarea.value = value;
  textarea.style.display = 'block';
  textarea.spellcheck = false;
  let timer = null;
  textarea.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => onChange && onChange(textarea.value), 220);
  });
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const s = textarea.selectionStart;
      const end = textarea.selectionEnd;
      textarea.value = textarea.value.slice(0, s) + '  ' + textarea.value.slice(end);
      textarea.selectionStart = textarea.selectionEnd = s + 2;
    }
  });
  return {
    kind: 'textarea',
    getValue: () => textarea.value,
    setValue: (v) => {
      textarea.value = v;
    },
    focus: () => textarea.focus(),
    cursor: () => {
      const upto = textarea.value.slice(0, textarea.selectionStart);
      const lines = upto.split('\n');
      return { line: lines.length, col: lines[lines.length - 1].length + 1 };
    },
    onCursor: (cb) => {
      textarea.addEventListener('keyup', cb);
      textarea.addEventListener('click', cb);
    },
    refresh: () => {},
    setWrap: (v) => {
      textarea.style.whiteSpace = v ? 'pre-wrap' : 'pre';
    },
    setFontSize: (px) => {
      textarea.style.fontSize = `${px}px`;
    },
  };
}
