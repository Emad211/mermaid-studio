#!/usr/bin/env python3
from pathlib import Path

path = Path('src/server/analytics.js')
text = path.read_text(encoding='utf-8')

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

path.write_text(text, encoding='utf-8')
print('analytics queue finalization applied')
