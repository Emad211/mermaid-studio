import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ANNOTATION_TYPES = new Set(['release', 'campaign', 'content', 'technical', 'advertising', 'other']);

function safeText(value, max = 240) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, max);
}

function safeNumber(value, min = 0, max = Number.MAX_SAFE_INTEGER, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function safeDate(value) {
  const text = String(value || '');
  if (!DATE_RE.test(text)) return '';
  const date = new Date(`${text}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? '' : text;
}

async function atomicWrite(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const temporary = `${filePath}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(value), { encoding: 'utf8', mode: 0o600 });
  await fs.rename(temporary, filePath);
}

async function readJson(filePath, fallback) {
  try {
    const value = JSON.parse(await fs.readFile(filePath, 'utf8'));
    return value && typeof value === 'object' ? value : fallback;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return fallback;
  }
}

function normalizeGoals(input = {}) {
  return {
    monthlyRevenueRial: Math.round(safeNumber(input.monthlyRevenueRial, 0, 10_000_000_000_000_000)),
    monthlyPageviews: Math.round(safeNumber(input.monthlyPageviews, 0, 10_000_000_000)),
    monthlyOrganicClicks: Math.round(safeNumber(input.monthlyOrganicClicks, 0, 10_000_000_000)),
    editorOpenRate: safeNumber(input.editorOpenRate, 0, 100),
    pageRpmRial: Math.round(safeNumber(input.pageRpmRial, 0, 100_000_000)),
    lcpMs: Math.round(safeNumber(input.lcpMs, 250, 30_000, 2_500)),
    inpMs: Math.round(safeNumber(input.inpMs, 20, 10_000, 200)),
    cls: safeNumber(input.cls, 0, 5, 0.1),
    updatedAt: new Date().toISOString(),
  };
}

function normalizeAnnotation(input = {}) {
  const date = safeDate(input.date);
  const title = safeText(input.title, 120);
  if (!date || !title) {
    const error = new Error('Annotation date and title are required.');
    error.status = 400;
    error.code = 'INVALID_ANNOTATION';
    throw error;
  }
  const type = safeText(input.type, 30).toLowerCase();
  return {
    id: safeText(input.id, 80) || crypto.randomUUID(),
    date,
    type: ANNOTATION_TYPES.has(type) ? type : 'other',
    title,
    note: safeText(input.note, 500),
    createdAt: safeText(input.createdAt, 60) || new Date().toISOString(),
  };
}

export class AdminStore {
  constructor({ dataDir, logger = console }) {
    this.dataDir = path.resolve(dataDir);
    this.logger = logger;
    this.operation = Promise.resolve();
  }

  file(name) {
    return path.join(this.dataDir, name);
  }

  enqueue(task) {
    const result = this.operation.catch(() => {}).then(task);
    this.operation = result.catch((error) => {
      this.logger.error('[admin-store]', error);
    });
    return result;
  }

  async getGoals() {
    const stored = await readJson(this.file('goals.json'), null);
    return stored ? normalizeGoals(stored) : normalizeGoals({});
  }

  saveGoals(input) {
    return this.enqueue(async () => {
      const goals = normalizeGoals(input);
      await atomicWrite(this.file('goals.json'), goals);
      return goals;
    });
  }

  async listAnnotations({ from = '', to = '' } = {}) {
    const collection = await readJson(this.file('annotations.json'), { version: 1, entries: [] });
    return (collection.entries || [])
      .filter((entry) => (!from || entry.date >= from) && (!to || entry.date <= to))
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  }

  addAnnotation(input) {
    return this.enqueue(async () => {
      const annotation = normalizeAnnotation(input);
      const collection = await readJson(this.file('annotations.json'), { version: 1, entries: [] });
      const entries = (collection.entries || []).filter((entry) => entry.id !== annotation.id);
      entries.push(annotation);
      collection.entries = entries.slice(-1_000);
      await atomicWrite(this.file('annotations.json'), collection);
      return annotation;
    });
  }

  deleteAnnotation(id) {
    return this.enqueue(async () => {
      const safeId = safeText(id, 80);
      const collection = await readJson(this.file('annotations.json'), { version: 1, entries: [] });
      const before = (collection.entries || []).length;
      collection.entries = (collection.entries || []).filter((entry) => entry.id !== safeId);
      if (collection.entries.length === before) {
        const error = new Error('Annotation not found.');
        error.status = 404;
        error.code = 'ANNOTATION_NOT_FOUND';
        throw error;
      }
      await atomicWrite(this.file('annotations.json'), collection);
    });
  }

  async auditHistory(limit = 30) {
    const collection = await readJson(this.file('seo-audits.json'), { version: 1, entries: [] });
    return (collection.entries || []).slice(-Math.max(1, Math.min(120, Number(limit) || 30))).reverse();
  }

  saveAudit(report) {
    return this.enqueue(async () => {
      const collection = await readJson(this.file('seo-audits.json'), { version: 1, entries: [] });
      const entry = {
        id: crypto.randomUUID(),
        runAt: safeText(report.runAt, 60) || new Date().toISOString(),
        score: Math.round(safeNumber(report.score, 0, 100)),
        grade: safeText(report.grade, 4),
        durationMs: Math.round(safeNumber(report.durationMs, 0, 600_000)),
        counts: report.counts || {},
        issues: Array.isArray(report.issues) ? report.issues.slice(0, 250) : [],
        pages: Array.isArray(report.pages) ? report.pages.slice(0, 250) : [],
        globalChecks: Array.isArray(report.globalChecks) ? report.globalChecks.slice(0, 100) : [],
      };
      collection.entries = [...(collection.entries || []), entry].slice(-120);
      await atomicWrite(this.file('seo-audits.json'), collection);
      return entry;
    });
  }

  async integrationStatus() {
    return readJson(this.file('integrations.json'), { version: 1, services: {} });
  }

  saveIntegrationStatus(name, value) {
    return this.enqueue(async () => {
      const collection = await readJson(this.file('integrations.json'), { version: 1, services: {} });
      collection.services ||= {};
      collection.services[safeText(name, 80)] = {
        ...(value && typeof value === 'object' ? value : {}),
        updatedAt: new Date().toISOString(),
      };
      await atomicWrite(this.file('integrations.json'), collection);
      return collection.services[safeText(name, 80)];
    });
  }
}

export function createAdminStore({ dataDir, logger = console }) {
  return new AdminStore({ dataDir, logger });
}
