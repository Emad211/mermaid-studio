#!/usr/bin/env python3
# One-shot source finalizer. The workflow deletes this file after validation.
from pathlib import Path

path = Path('src/server/analytics.js')
text = path.read_text(encoding='utf-8')

old_hydrate = """function hydrateDay(value, day) {
  const fresh = emptyDay(day);
  if (!value || typeof value !== 'object') return fresh;
  const merged = {
    ...fresh,
    ...value,
    totals: { ...fresh.totals, ...(value.totals || {}) },
    unique: { ...fresh.unique, ...(value.unique || {}) },
    vitals: { ...fresh.vitals, ...(value.vitals || {}) },
  };
"""
new_hydrate = """function hydrateDay(value, day) {
  const fresh = emptyDay(day);
  const persisted = value && typeof value === 'object' ? value : {};
  const merged = {
    ...fresh,
    ...persisted,
    totals: { ...fresh.totals, ...(persisted.totals || {}) },
    unique: { ...fresh.unique, ...(persisted.unique || {}) },
    vitals: { ...fresh.vitals, ...(persisted.vitals || {}) },
  };
"""
if old_hydrate in text:
    text = text.replace(old_hydrate, new_hydrate, 1)
elif 'const persisted = value && typeof value' not in text:
    raise SystemExit('analytics hydration anchor not found')

anchor = """  async init() {
"""
enqueue = """  enqueue(task) {
    const result = this.operation.catch(() => {}).then(task);
    this.operation = result.catch((error) => {
      this.lastError = error?.message || String(error);
      this.logger.error('[analytics:operation]', error);
    });
    return result;
  }

  async init() {
"""
if '  enqueue(task) {' not in text:
    if anchor not in text:
        raise SystemExit('analytics init anchor not found')
    text = text.replace(anchor, enqueue, 1)

old_start = "    this.operation = this.operation.then(async () => {"
count = text.count(old_start)
if count:
    if count != 4:
        raise SystemExit(f'unexpected operation-chain count: {count}')
    text = text.replace(old_start, "    return this.enqueue(async () => {")

record_tail = """    }).catch((error) => {
      this.lastError = error.message;
      throw error;
    });
    return this.operation;
"""
if record_tail in text:
    text = text.replace(record_tail, "    });\n", 1)

plain_tail = """    });
    return this.operation;
"""
plain_count = text.count(plain_tail)
if plain_count:
    if plain_count != 3:
        raise SystemExit(f'unexpected plain operation-tail count: {plain_count}')
    text = text.replace(plain_tail, "    });\n")

if 'this.operation = this.operation.then(async () =>' in text:
    raise SystemExit('unsafe promise chain remains')
if 'if (!value || typeof value !== \'object\') return fresh;' in text:
    raise SystemExit('unhydrated transient sets remain')

path.write_text(text, encoding='utf-8')
print('analytics hydration and queue finalization applied')
