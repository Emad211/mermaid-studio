#!/usr/bin/env python3
from pathlib import Path

path = Path('src/server/analytics.js')
text = path.read_text(encoding='utf-8')
old = r"""      const collection = await this.loadCollection(this.searchPath(), { version: 1, rows: [] });
      const map = new Map();
      for (const row of [...(collection.rows || []), ...normalized]) {
        const key = `${row.date}\u0000${row.query}\u0000${row.page}`;
        const current = map.get(key) || { ...row, clicks: 0, impressions: 0, weightedPosition: 0 };
        current.clicks += row.clicks;
        current.impressions += row.impressions;
        current.weightedPosition += row.position * Math.max(1, row.impressions);
        current.position = current.weightedPosition / Math.max(1, current.impressions);
        map.set(key, current);
      }
      collection.rows = [...map.values()].map(({ weightedPosition, ...row }) => row);
"""
new = r"""      const collection = await this.loadCollection(this.searchPath(), { version: 1, rows: [] });
      const keyFor = (row) => `${row.date}\u0000${row.query}\u0000${row.page}`;
      const map = new Map((collection.rows || []).map((row) => [keyFor(row), row]));
      const incoming = new Map();
      for (const row of normalized) {
        const key = keyFor(row);
        const current = incoming.get(key) || { ...row, clicks: 0, impressions: 0, weightedPosition: 0 };
        current.clicks += row.clicks;
        current.impressions += row.impressions;
        current.weightedPosition += row.position * Math.max(1, row.impressions);
        current.position = current.weightedPosition / Math.max(1, current.impressions);
        incoming.set(key, current);
      }
      for (const [key, value] of incoming) {
        const { weightedPosition, ...row } = value;
        map.set(key, row);
      }
      collection.rows = [...map.values()];
"""
if old not in text:
    raise SystemExit('Search import block did not match expected validated source')
text = text.replace(old, new, 1)
path.write_text(text, encoding='utf-8')
print('Search Console import is now idempotent')
