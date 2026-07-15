import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ANNOTATION_TYPES = new Set(['release', 'campaign', 'content', 'technical', 'advertising', 'other']);
const BRIEF_STATUSES = new Set(['idea', 'research', 'writing', 'review', 'scheduled', 'published', 'archived']);
const BRIEF_TYPES = new Set(['tutorial', 'article', 'landing', 'update']);
const SEARCH_INTENTS = new Set(['informational', 'problem-solving', 'comparison', 'navigational', 'transactional']);

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

function normalizeContentBrief(input = {}, existing = {}) {
  const title = safeText(input.title, 180);
  if (!title) {
    const error = new Error('Content brief title is required.');
    error.status = 400;
    error.code = 'INVALID_CONTENT_BRIEF';
    throw error;
  }
  const status = safeText(input.status, 30).toLowerCase();
  const contentType = safeText(input.contentType, 30).toLowerCase();
  const searchIntent = safeText(input.searchIntent, 40).toLowerCase();
  const dueDate = input.dueDate ? safeDate(input.dueDate) : '';
  if (input.dueDate && !dueDate) {
    const error = new Error('Content brief dueDate must use YYYY-MM-DD.');
    error.status = 400;
    error.code = 'INVALID_CONTENT_BRIEF_DATE';
    throw error;
  }
  const now = new Date().toISOString();
  return {
    id: safeText(existing.id || input.id, 80) || crypto.randomUUID(),
    title,
    contentType: BRIEF_TYPES.has(contentType) ? contentType : 'article',
    status: BRIEF_STATUSES.has(status) ? status : 'idea',
    priority: Math.round(safeNumber(input.priority, 1, 5, 3)),
    owner: safeText(input.owner, 100),
    dueDate,
    cluster: safeText(input.cluster, 120),
    targetQuery: safeText(input.targetQuery, 220),
    searchIntent: SEARCH_INTENTS.has(searchIntent) ? searchIntent : 'informational',
    targetUrl: safeText(input.targetUrl, 300),
    angle: safeText(input.angle, 1_200),
    outline: safeText(input.outline, 4_000),
    successMetric: safeText(input.successMetric, 1_000),
    notes: safeText(input.notes, 2_000),
    createdAt: safeText(existing.createdAt || input.createdAt, 60) || now,
    updatedAt: now,
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

  async listContentBriefs() {
    const collection = await readJson(this.file('content-briefs.json'), { version: 1, entries: [] });
    return (collection.entries || []).slice().sort((a, b) => a.priority - b.priority || (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || b.updatedAt.localeCompare(a.updatedAt));
  }

  saveContentBrief(input, id = '') {
    return this.enqueue(async () => {
      const collection = await readJson(this.file('content-briefs.json'), { version: 1, entries: [] });
      const existing = id ? (collection.entries || []).find((entry) => entry.id === safeText(id, 80)) : null;
      if (id && !existing) {
        const error = new Error('Content brief not found.');
        error.status = 404;
        error.code = 'CONTENT_BRIEF_NOT_FOUND';
        throw error;
      }
      const brief = normalizeContentBrief({ ...input, id: existing?.id || input.id }, existing || {});
      collection.entries = [...(collection.entries || []).filter((entry) => entry.id !== brief.id), brief].slice(-5_000);
      await atomicWrite(this.file('content-briefs.json'), collection);
      return brief;
    });
  }

  deleteContentBrief(id) {
    return this.enqueue(async () => {
      const safeId = safeText(id, 80);
      const collection = await readJson(this.file('content-briefs.json'), { version: 1, entries: [] });
      const before = (collection.entries || []).length;
      collection.entries = (collection.entries || []).filter((entry) => entry.id !== safeId);
      if (collection.entries.length === before) {
        const error = new Error('Content brief not found.');
        error.status = 404;
        error.code = 'CONTENT_BRIEF_NOT_FOUND';
        throw error;
      }
      await atomicWrite(this.file('content-briefs.json'), collection);
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
