const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const fa = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 1 });
const integerFa = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 0 });
const dateFa = new Intl.DateTimeFormat('fa-IR', { year: 'numeric', month: 'short', day: 'numeric' });

const STATUS = [
  ['idea', 'ایده'],
  ['research', 'تحقیق'],
  ['writing', 'نوشتن'],
  ['review', 'بازبینی'],
  ['scheduled', 'آمادهٔ انتشار'],
  ['published', 'منتشرشده'],
];
const TYPE_LABELS = { tutorial: 'آموزش', article: 'مقاله', landing: 'لندینگ', update: 'به‌روزرسانی' };
const OPPORTUNITY_LABELS = { ctr: 'CTR پایین', striking: 'فاصلهٔ رتبه', gap: 'شکاف محتوا' };
const HEALTH_LABELS = { healthy: 'سالم', watch: 'پایش', review: 'بازبینی', critical: 'فوری' };

let data = null;
let selectedBriefId = '';
let toastTimer;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function number(value, digits = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '—';
  return (digits ? fa : integerFa).format(parsed);
}

function percent(value) {
  return `${fa.format(Number(value) || 0)}٪`;
}

function duration(seconds) {
  const value = Number(seconds) || 0;
  if (!value) return '—';
  return value < 60 ? `${fa.format(value)} ثانیه` : `${fa.format(value / 60)} دقیقه`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function notify(message, state = 'ok') {
  const toast = $('#content-toast');
  toast.textContent = message;
  toast.className = `admin-toast is-visible ${state}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 3200);
}

function status(message, state = '') {
  const node = $('#content-status');
  node.textContent = message;
  node.className = `analytics-status ${state}`.trim();
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    cache: 'no-store',
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    let message = `خطای ${response.status}`;
    try {
      const body = await response.json();
      message = body.error || message;
    } catch {
      // Keep the HTTP fallback.
    }
    throw new Error(message);
  }
  return response.status === 204 ? null : response.json();
}

function dueState(brief) {
  if (!brief.dueDate || ['published', 'archived'].includes(brief.status)) return '';
  const distance = Math.round((new Date(`${brief.dueDate}T00:00:00Z`) - new Date(`${today()}T00:00:00Z`)) / 86_400_000);
  if (distance < 0) return 'is-overdue';
  if (distance <= 7) return 'is-due';
  return '';
}

function renderMetrics() {
  const metrics = data?.metrics || {};
  $('#content-total').textContent = number(metrics.totalContent);
  $('#content-stale').textContent = number(metrics.staleContent);
  $('#brief-active').textContent = number(metrics.activeBriefs);
  $('#brief-due').textContent = number(metrics.dueBriefs);
  $('#content-opportunities').textContent = number(metrics.opportunities);
  $('#content-potential-clicks').textContent = number(metrics.potentialClicks);
}

function filteredBriefs() {
  const type = $('#brief-type-filter').value;
  const owner = $('#brief-owner-filter').value;
  return (data?.briefs || []).filter((brief) => (type === 'all' || brief.contentType === type) && (owner === 'all' || brief.owner === owner));
}

function renderBoard() {
  const briefs = filteredBriefs();
  $('#brief-board').innerHTML = STATUS.map(([key, label]) => {
    const rows = briefs.filter((brief) => brief.status === key);
    return `<section class="brief-column" data-status="${key}"><header class="brief-column-head"><strong>${label}</strong><span>${number(rows.length)}</span></header><div class="brief-stack">${rows.length ? rows.map((brief) => `<button class="brief-card ${dueState(brief)}" type="button" data-brief-id="${escapeHtml(brief.id)}"><div class="brief-card-top"><span class="brief-card-type">${escapeHtml(TYPE_LABELS[brief.contentType] || brief.contentType)}</span><span class="brief-priority">P${escapeHtml(brief.priority)}</span></div><strong>${escapeHtml(brief.title)}</strong><p>${escapeHtml(brief.angle || brief.targetQuery || 'زاویه هنوز نوشته نشده است.')}</p><div class="brief-card-foot"><span>${escapeHtml(brief.owner || 'بدون مسئول')}</span>${brief.dueDate ? `<time datetime="${brief.dueDate}">${escapeHtml(brief.dueDate)}</time>` : '<span>بدون موعد</span>'}</div></button>`).join('') : '<div class="brief-empty">کار فعالی در این مرحله نیست.</div>'}</div></section>`;
  }).join('');
}

function renderOwners() {
  const select = $('#brief-owner-filter');
  const current = select.value || 'all';
  select.innerHTML = '<option value="all">همهٔ مسئول‌ها</option>' + (data?.owners || []).map((owner) => `<option value="${escapeHtml(owner)}">${escapeHtml(owner)}</option>`).join('');
  select.value = [...select.options].some((option) => option.value === current) ? current : 'all';
}

function renderOpportunities() {
  const filter = $('#opportunity-filter').value;
  const rows = (data?.opportunities || []).filter((row) => filter === 'all' || row.type === filter);
  $('#opportunity-table').innerHTML = rows.length ? rows.map((row) => `<tr><td>${escapeHtml(row.query)}</td><td><span class="opportunity-type ${escapeHtml(row.type)}">${escapeHtml(OPPORTUNITY_LABELS[row.type] || row.type)}</span></td><td class="number">${number(row.impressions)}</td><td class="number">${number(row.clicks)}</td><td class="number">${percent(row.ctr)}</td><td class="number">${number(row.position, 1)}</td><td class="number">${row.potentialClicks ? `+${number(row.potentialClicks)}` : '—'}</td><td><button class="table-action opportunity-to-brief" type="button" data-opportunity-id="${escapeHtml(row.id)}">ساخت Brief</button></td></tr>`).join('') : '<tr><td class="empty-row" colspan="8">فرصت معناداری در این بازه پیدا نشد.</td></tr>';
}

function filteredInventory() {
  const query = $('#inventory-search').value.trim().toLowerCase();
  const type = $('#inventory-type').value;
  return (data?.inventory || []).filter((item) => {
    if (type !== 'all' && item.type !== type) return false;
    if (!query) return true;
    return `${item.title} ${item.path} ${item.category}`.toLowerCase().includes(query);
  });
}

function renderInventory() {
  const rows = filteredInventory();
  $('#inventory-table').innerHTML = rows.length ? rows.map((item) => `<tr><td class="content-title-cell"><strong>${escapeHtml(item.title)}</strong><code>${escapeHtml(item.path)}</code></td><td>${item.type === 'tutorial' ? 'آموزش' : 'مقاله'}</td><td class="number">${escapeHtml(item.updated)}</td><td class="number">${number(item.wordCount)}</td><td class="number">${number(item.pageviews)}</td><td class="number">${duration(item.avgEngagementSeconds)}</td><td class="number">${percent(item.editorOpenRate)}</td><td class="number">${number(item.searchClicks)}</td><td class="number">${item.searchPosition ? number(item.searchPosition, 1) : '—'}</td><td><span class="health-label ${escapeHtml(item.health.state)}">${escapeHtml(HEALTH_LABELS[item.health.state])} · ${number(item.health.score)}</span><div class="health-reasons">${escapeHtml(item.health.reasons.join('، ') || 'نشانهٔ منفی مهمی ثبت نشده است.')}</div></td><td><button class="table-action inventory-to-brief" type="button" data-content-path="${escapeHtml(item.path)}">${escapeHtml(item.health.action)}</button></td></tr>`).join('') : '<tr><td class="empty-row" colspan="11">محتوایی با این فیلتر پیدا نشد.</td></tr>';
}

function renderCalendar() {
  const rows = data?.calendar || [];
  $('#editorial-calendar').innerHTML = rows.length ? rows.map((brief) => {
    const overdue = brief.dueDate < today();
    return `<button class="calendar-item ${overdue ? 'overdue' : ''}" type="button" data-brief-id="${escapeHtml(brief.id)}"><time datetime="${brief.dueDate}">${dateFa.format(new Date(`${brief.dueDate}T00:00:00Z`))}</time><div><strong>${escapeHtml(brief.title)}</strong><small>${escapeHtml(brief.owner || 'بدون مسئول')} · ${escapeHtml(TYPE_LABELS[brief.contentType] || brief.contentType)}</small></div><span>${overdue ? 'عقب‌افتاده' : escapeHtml(STATUS.find(([key]) => key === brief.status)?.[1] || brief.status)}</span></button>`;
  }).join('') : '<div class="check-item pass"><div><strong>موعد نزدیکی وجود ندارد</strong><small>Brief دارای due date در اینجا نمایش داده می‌شود.</small></div></div>';
}

function fillForm(brief = {}) {
  const form = $('#brief-form');
  selectedBriefId = brief.id || '';
  for (const field of ['id', 'title', 'contentType', 'status', 'priority', 'owner', 'dueDate', 'cluster', 'targetQuery', 'searchIntent', 'targetUrl', 'angle', 'outline', 'successMetric', 'notes']) {
    const input = form.elements.namedItem(field);
    if (!input) continue;
    input.value = brief[field] ?? (field === 'contentType' ? 'article' : field === 'status' ? 'idea' : field === 'priority' ? '3' : field === 'searchIntent' ? 'informational' : '');
  }
  $('#brief-form-title').textContent = selectedBriefId ? 'ویرایش Brief' : 'Brief محتوای جدید';
  $('#delete-brief').hidden = !selectedBriefId;
  $('#brief-editor-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function briefFromOpportunity(row) {
  fillForm({
    title: row.suggestedTitle,
    contentType: row.suggestedContentType,
    status: 'idea',
    priority: row.potentialClicks >= 20 ? 2 : 3,
    targetQuery: row.query,
    searchIntent: row.type === 'ctr' ? 'problem-solving' : 'informational',
    angle: row.suggestedAngle,
    successMetric: `بهبود کلیک و پوشش Query «${row.query}»؛ baseline: ${number(row.impressions)} نمایش، CTR ${percent(row.ctr)}، جایگاه ${number(row.position, 1)}.`,
  });
}

function briefFromInventory(item) {
  fillForm({
    title: `بازبینی: ${item.title}`,
    contentType: 'update',
    status: 'idea',
    priority: item.health.state === 'critical' ? 1 : 2,
    targetQuery: item.targetQuery,
    targetUrl: item.path,
    angle: `این صفحه به بازبینی نیاز دارد: ${item.health.reasons.join('، ') || item.health.action}. ابتدا قصد جست‌وجو و تغییرات محصول را بررسی کن، سپس فقط بخش‌های لازم را اصلاح کن.`,
    successMetric: `بهبود تعامل، نرخ ورود به ادیتور یا CTR بدون تازه‌نمایی مصنوعی تاریخ صفحه.`,
  });
}

function renderAll() {
  renderMetrics();
  renderOwners();
  renderBoard();
  renderOpportunities();
  renderInventory();
  renderCalendar();
  const dot = $('#content-health-dot');
  const urgent = Number(data?.metrics?.staleContent) + Number(data?.metrics?.dueBriefs);
  dot.className = `health-dot ${urgent ? 'error' : 'ok'}`;
  $('#content-health-title').textContent = urgent ? `${number(urgent)} مورد نیازمند توجه` : 'برنامهٔ محتوا پایدار است';
  $('#content-health-note').textContent = `${number(data?.metrics?.totalContent)} صفحه · ${number(data?.metrics?.activeBriefs)} Brief فعال`;
  status(`آخرین تحلیل: ${new Date().toLocaleTimeString('fa-IR')}`, 'ok');
}

async function load() {
  $('#refresh-content').disabled = true;
  status('در حال ترکیب دادهٔ محتوا و جست‌وجو…');
  try {
    data = await api(`/api/admin/content/overview?days=${encodeURIComponent($('#content-range').value)}`);
    renderAll();
  } catch (error) {
    status(error.message, 'error');
  } finally {
    $('#refresh-content').disabled = false;
  }
}

$('#brief-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.currentTarget).entries());
  values.priority = Number(values.priority) || 3;
  const id = values.id;
  delete values.id;
  const url = id ? `/api/admin/content/briefs/${encodeURIComponent(id)}` : '/api/admin/content/briefs';
  try {
    await api(url, { method: id ? 'PUT' : 'POST', body: JSON.stringify(values) });
    notify(id ? 'Brief به‌روزرسانی شد.' : 'Brief جدید ثبت شد.');
    fillForm();
    await load();
  } catch (error) {
    notify(error.message, 'error');
  }
});

$('#delete-brief').addEventListener('click', async () => {
  if (!selectedBriefId || !confirm('این Brief حذف شود؟')) return;
  try {
    await api(`/api/admin/content/briefs/${encodeURIComponent(selectedBriefId)}`, { method: 'DELETE' });
    notify('Brief حذف شد.');
    fillForm();
    await load();
  } catch (error) {
    notify(error.message, 'error');
  }
});

$('#brief-board').addEventListener('click', (event) => {
  const card = event.target.closest('[data-brief-id]');
  if (!card) return;
  const brief = data.briefs.find((item) => item.id === card.dataset.briefId);
  if (brief) fillForm(brief);
});

$('#editorial-calendar').addEventListener('click', (event) => {
  const card = event.target.closest('[data-brief-id]');
  if (!card) return;
  const brief = data.briefs.find((item) => item.id === card.dataset.briefId);
  if (brief) fillForm(brief);
});

$('#opportunity-table').addEventListener('click', (event) => {
  const button = event.target.closest('.opportunity-to-brief');
  if (!button) return;
  const row = data.opportunities.find((item) => item.id === button.dataset.opportunityId);
  if (row) briefFromOpportunity(row);
});

$('#inventory-table').addEventListener('click', (event) => {
  const button = event.target.closest('.inventory-to-brief');
  if (!button) return;
  const item = data.inventory.find((row) => row.path === button.dataset.contentPath);
  if (item) briefFromInventory(item);
});

$('#new-brief').addEventListener('click', () => fillForm());
$('#clear-brief').addEventListener('click', () => fillForm());
$('#refresh-content').addEventListener('click', load);
$('#content-range').addEventListener('change', load);
$('#brief-type-filter').addEventListener('change', renderBoard);
$('#brief-owner-filter').addEventListener('change', renderBoard);
$('#opportunity-filter').addEventListener('change', renderOpportunities);
$('#inventory-search').addEventListener('input', renderInventory);
$('#inventory-type').addEventListener('change', renderInventory);
$('#sidebar-toggle').addEventListener('click', () => document.body.classList.toggle('sidebar-open'));
document.addEventListener('click', (event) => {
  if (document.body.classList.contains('sidebar-open') && !event.target.closest('.admin-sidebar') && !event.target.closest('#sidebar-toggle')) document.body.classList.remove('sidebar-open');
});

fillForm();
load();
