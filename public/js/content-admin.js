const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const numberFa = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 1 });
const dateFa = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium' });

const STATUS = [
  ['idea', 'ایده'],
  ['research', 'تحقیق'],
  ['writing', 'نوشتن'],
  ['review', 'بازبینی'],
  ['scheduled', 'آمادهٔ انتشار'],
  ['published', 'منتشرشده'],
];

const TYPE_LABELS = { tutorial: 'آموزش', article: 'مقاله', landing: 'لندینگ', update: 'به‌روزرسانی' };
let data = null;
let selectedBriefId = '';
let toastTimer;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function formatNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? numberFa.format(number) : '—';
}

function formatPercent(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${numberFa.format(number)}٪` : '—';
}

function formatDuration(seconds) {
  const value = Number(seconds) || 0;
  if (value < 60) return `${numberFa.format(value)} ثانیه`;
  return `${numberFa.format(value / 60)} دقیقه`;
}

function notify(message, state = 'ok') {
  const toast = $('#content-toast');
  toast.textContent = message;
  toast.className = `admin-toast is-visible ${state}`.trim();
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 3_500);
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
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || body.message || `خطای ${response.status}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

function statusLabel(value) {
  return STATUS.find(([key]) => key === value)?.[1] || value;
}

function dueState(brief) {
  if (!brief.dueDate || ['published', 'archived'].includes(brief.status)) return '';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const date = new Date(`${brief.dueDate}T00:00:00`);
  if (date < today) return 'overdue';
  if ((date - today) / 86_400_000 <= 7) return 'soon';
  return '';
}

function currentBriefs() {
  const type = $('#brief-type-filter').value;
  const owner = $('#brief-owner-filter').value;
  return (data?.briefs || []).filter((brief) =>
    (type === 'all' || brief.contentType === type) &&
    (owner === 'all' || brief.owner === owner));
}

function renderBoard() {
  const root = $('#brief-board');
  const briefs = currentBriefs();
  root.innerHTML = STATUS.map(([status, label]) => {
    const rows = briefs.filter((brief) => brief.status === status).sort((a, b) => Number(a.priority) - Number(b.priority) || String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999')));
    return `<section class="brief-column"><header class="brief-column-head"><strong>${label}</strong><span>${formatNumber(rows.length)}</span></header><div class="brief-column-list">${rows.length ? rows.map((brief) => `<button class="brief-card ${dueState(brief) === 'overdue' ? 'is-overdue' : ''}" data-priority="${brief.priority}" data-brief-id="${escapeHtml(brief.id)}" type="button"><strong>${escapeHtml(brief.title)}</strong><p>${escapeHtml(brief.targetQuery || brief.angle || 'بدون Query و زاویه')}</p><footer><span class="brief-type">${escapeHtml(TYPE_LABELS[brief.contentType] || brief.contentType)}</span><span>${brief.dueDate ? escapeHtml(brief.dueDate) : 'بدون موعد'}</span></footer></button>`).join('') : '<div class="brief-empty">کاری در این مرحله نیست.</div>'}</div></section>`;
  }).join('');
}

function populateOwners() {
  const select = $('#brief-owner-filter');
  const selected = select.value || 'all';
  const owners = [...new Set((data?.briefs || []).map((brief) => brief.owner).filter(Boolean))].sort();
  select.innerHTML = '<option value="all">همهٔ مسئول‌ها</option>' + owners.map((owner) => `<option value="${escapeHtml(owner)}">${escapeHtml(owner)}</option>`).join('');
  select.value = owners.includes(selected) ? selected : 'all';
}

function contentState(row) {
  if (row.health === 'critical') return ['bad', 'نیاز فوری'];
  if (row.health === 'review') return ['warning', 'نیاز به بازبینی'];
  return ['', 'پایدار'];
}

function contentAction(row) {
  if (row.healthReasons?.includes('search-ctr')) return 'بازنویسی Title و مقدمه';
  if (row.healthReasons?.includes('editor-conversion')) return 'بهبود مثال و CTA';
  if (row.healthReasons?.includes('stale')) return 'بازبینی فنی و تاریخ';
  if (row.healthReasons?.includes('thin')) return 'افزودن تجربه و مثال';
  if (row.searchPosition > 3 && row.searchPosition <= 20) return 'تقویت لینک داخلی';
  return 'حفظ و پایش';
}

function filteredInventory() {
  const query = $('#inventory-search').value.trim().toLowerCase();
  const type = $('#inventory-type').value;
  return (data?.inventory || []).filter((row) =>
    (type === 'all' || row.type === type) &&
    (!query || `${row.title} ${row.path}`.toLowerCase().includes(query)));
}

function renderInventory() {
  const rows = filteredInventory();
  $('#inventory-table').innerHTML = rows.length ? rows.map((row) => {
    const [className, label] = contentState(row);
    return `<tr><td><a href="${escapeHtml(row.path)}" target="_blank" rel="noopener"><strong>${escapeHtml(row.title)}</strong><small class="table-path">${escapeHtml(row.path)}</small></a></td><td>${row.type === 'tutorial' ? 'آموزش' : 'مقاله'}</td><td>${escapeHtml(row.updated)}</td><td class="number">${formatNumber(row.wordCount)}</td><td class="number">${formatNumber(row.pageviews)}</td><td class="number">${formatDuration(row.avgEngagementSeconds)}</td><td class="number">${formatPercent(row.editorOpenRate)}</td><td class="number">${formatNumber(row.searchClicks)}</td><td class="number">${row.searchPosition ? formatNumber(row.searchPosition) : '—'}</td><td><span class="content-health ${className}">${label}</span></td><td><button class="content-action inventory-brief" type="button" data-path="${escapeHtml(row.path)}">${escapeHtml(contentAction(row))}</button></td></tr>`;
  }).join('') : '<tr><td colspan="11" class="empty-row">محتوایی با این فیلتر پیدا نشد.</td></tr>';
}

function opportunityRows() {
  const type = $('#opportunity-filter').value;
  return (data?.opportunities || []).filter((row) => type === 'all' || row.type === type);
}

function opportunityLabel(type) {
  return { ctr: 'CTR پایین', striking: 'فاصلهٔ رتبه', gap: 'شکاف محتوا' }[type] || type;
}

function renderOpportunities() {
  const rows = opportunityRows();
  $('#opportunity-table').innerHTML = rows.length ? rows.map((row) => `<tr><td>${escapeHtml(row.name)}</td><td>${opportunityLabel(row.type)}</td><td class="number">${formatNumber(row.impressions)}</td><td class="number">${formatNumber(row.clicks)}</td><td class="number">${formatPercent(row.ctr)}</td><td class="number">${formatNumber(row.position)}</td><td class="number">${row.missingClicks ? `+${formatNumber(row.missingClicks)} کلیک` : '—'}</td><td><button class="content-action opportunity-brief" type="button" data-query="${escapeHtml(row.name)}" data-type="${escapeHtml(row.type)}">ساخت Brief</button></td></tr>`).join('') : '<tr><td colspan="8" class="empty-row">فرصت معناداری در این بازه ثبت نشده است.</td></tr>';
}

function renderCalendar() {
  const rows = (data?.briefs || [])
    .filter((brief) => brief.dueDate && !['published', 'archived'].includes(brief.status))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 12);
  $('#editorial-calendar').innerHTML = rows.length ? rows.map((brief) => `<button class="calendar-item ${dueState(brief) === 'overdue' ? 'is-overdue' : ''}" type="button" data-brief-id="${escapeHtml(brief.id)}"><span class="calendar-date">${escapeHtml(brief.dueDate)}</span><span class="calendar-copy"><strong>${escapeHtml(brief.title)}</strong><small>${escapeHtml(brief.owner || 'بدون مسئول')} · ${statusLabel(brief.status)}</small></span><span>${escapeHtml(TYPE_LABELS[brief.contentType] || brief.contentType)}</span></button>`).join('') : '<div class="empty-row">موعد فعالی ثبت نشده است.</div>';
}

function renderKpis() {
  const counts = data?.counts || {};
  $('#content-total').textContent = formatNumber(counts.total);
  $('#content-stale').textContent = formatNumber(counts.needsReview);
  $('#brief-active').textContent = formatNumber(counts.activeBriefs);
  $('#brief-due').textContent = formatNumber(counts.dueSoon);
  $('#content-opportunities').textContent = formatNumber(counts.opportunities);
  $('#content-potential-clicks').textContent = formatNumber(counts.potentialClicks);
}

function formElement(name) {
  return $('#brief-form').elements.namedItem(name);
}

function clearForm() {
  selectedBriefId = '';
  $('#brief-form').reset();
  formElement('priority').value = '3';
  formElement('status').value = 'idea';
  formElement('contentType').value = 'article';
  $('#brief-form-title').textContent = 'Brief محتوا';
  $('#delete-brief').hidden = true;
  $('#brief-message').textContent = '';
}

function editBrief(brief) {
  if (!brief) return;
  selectedBriefId = brief.id;
  for (const [key, value] of Object.entries(brief)) {
    const input = formElement(key);
    if (input) input.value = value ?? '';
  }
  $('#brief-form-title').textContent = 'ویرایش Brief';
  $('#delete-brief').hidden = false;
  $('#brief-editor-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function suggestedOutline(query, type) {
  const label = type === 'gap' ? 'پاسخ کامل به سؤال و تعریف مفاهیم' : type === 'ctr' ? 'شروع مستقیم با مسئله و نتیجهٔ قابل انتظار' : 'بهبود محتوای موجود و پوشش زیرموضوع‌ها';
  return `۱. مسئلهٔ کاربر: ${query}\n۲. ${label}\n۳. مثال واقعی و قابل اجرا\n۴. محدودیت‌ها و مواردی که جواب نمی‌دهد\n۵. چک‌لیست یا تمرین\n۶. قدم بعدی و لینک داخلی`;
}

function createFromOpportunity(query, type = 'gap') {
  clearForm();
  formElement('title').value = query;
  formElement('targetQuery').value = query;
  formElement('contentType').value = type === 'ctr' ? 'update' : 'article';
  formElement('searchIntent').value = type === 'ctr' ? 'problem-solving' : 'informational';
  formElement('angle').value = `خواننده‌ای که «${query}» را جست‌وجو می‌کند دقیقاً چه چیزی را می‌خواهد بفهمد یا انجام دهد؟ پاسخ باید از همان ابتدای صفحه روشن باشد.`;
  formElement('outline').value = suggestedOutline(query, type);
  formElement('successMetric').value = type === 'ctr' ? 'بهبود CTR و حفظ جایگاه فعلی' : 'افزایش Impression، کلیک ارگانیک و ورود مرتبط به ادیتور';
  $('#brief-editor-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  formElement('title').focus();
}

function createFromInventory(pathname) {
  const row = (data?.inventory || []).find((item) => item.path === pathname);
  if (!row) return;
  clearForm();
  formElement('title').value = `بازبینی: ${row.title}`;
  formElement('contentType').value = 'update';
  formElement('targetUrl').value = row.path;
  formElement('targetQuery').value = row.targetQuery || '';
  formElement('angle').value = `${contentAction(row)}. ابتدا بررسی کن آیا قصد جست‌وجو یا رفتار محصول تغییر کرده است؛ تاریخ را فقط پس از اصلاح واقعی به‌روز کن.`;
  formElement('outline').value = `۱. بررسی Query و صفحات رقیب\n۲. اجرای دوبارهٔ تمام مثال‌ها\n۳. بازبینی مقدمه و وعدهٔ صفحه\n۴. افزودن تجربه، محدودیت و لینک داخلی\n۵. بررسی CTA و دسترس‌پذیری`;
  formElement('successMetric').value = 'بهبود شاخص اصلی مشکل بدون افت تعامل یا جایگاه فعلی';
  $('#brief-editor-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function loadData() {
  const button = $('#refresh-content');
  button.disabled = true;
  $('#content-status').textContent = 'در حال تحلیل موجودی، Search و برنامه…';
  $('#content-status').className = 'analytics-status';
  try {
    data = await api(`/api/admin/content/overview?days=${encodeURIComponent($('#content-range').value)}`);
    renderKpis();
    populateOwners();
    renderBoard();
    renderInventory();
    renderOpportunities();
    renderCalendar();
    const dot = $('#content-health-dot');
    dot.className = `health-dot ${data.counts?.needsReview ? 'error' : 'ok'}`;
    $('#content-health-title').textContent = data.counts?.needsReview ? `${formatNumber(data.counts.needsReview)} مورد نیازمند تصمیم` : 'موجودی محتوا پایدار است';
    $('#content-health-note').textContent = `آخرین تحلیل ${new Date().toLocaleTimeString('fa-IR')}`;
    $('#content-status').textContent = `به‌روزرسانی شد · ${dateFa.format(new Date())}`;
    $('#content-status').className = 'analytics-status ok';
  } catch (error) {
    $('#content-status').textContent = error.message;
    $('#content-status').className = 'analytics-status error';
    $('#content-health-dot').className = 'health-dot error';
    $('#content-health-title').textContent = 'دریافت داده ناموفق بود';
  } finally {
    button.disabled = false;
  }
}

$('#brief-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.currentTarget).entries());
  const id = values.id || selectedBriefId;
  delete values.id;
  $('#brief-message').textContent = 'در حال ذخیره…';
  try {
    if (id) await api(`/api/admin/content/briefs/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(values) });
    else await api('/api/admin/content/briefs', { method: 'POST', body: JSON.stringify(values) });
    notify(id ? 'Brief به‌روزرسانی شد.' : 'Brief جدید ثبت شد.');
    clearForm();
    await loadData();
  } catch (error) {
    $('#brief-message').textContent = error.message;
    $('#brief-message').className = 'form-message error';
  }
});

$('#delete-brief').addEventListener('click', async () => {
  if (!selectedBriefId || !confirm('این Brief حذف شود؟')) return;
  try {
    await api(`/api/admin/content/briefs/${encodeURIComponent(selectedBriefId)}`, { method: 'DELETE' });
    notify('Brief حذف شد.');
    clearForm();
    await loadData();
  } catch (error) { notify(error.message, 'error'); }
});

$('#brief-board').addEventListener('click', (event) => {
  const card = event.target.closest('[data-brief-id]');
  if (card) editBrief((data?.briefs || []).find((brief) => brief.id === card.dataset.briefId));
});
$('#editorial-calendar').addEventListener('click', (event) => {
  const card = event.target.closest('[data-brief-id]');
  if (card) editBrief((data?.briefs || []).find((brief) => brief.id === card.dataset.briefId));
});
$('#opportunity-table').addEventListener('click', (event) => {
  const button = event.target.closest('.opportunity-brief');
  if (button) createFromOpportunity(button.dataset.query, button.dataset.type);
});
$('#inventory-table').addEventListener('click', (event) => {
  const button = event.target.closest('.inventory-brief');
  if (button) createFromInventory(button.dataset.path);
});

$('#new-brief').addEventListener('click', () => { clearForm(); $('#brief-editor-panel').scrollIntoView({ behavior: 'smooth' }); formElement('title').focus(); });
$('#clear-brief').addEventListener('click', clearForm);
$('#refresh-content').addEventListener('click', loadData);
$('#content-range').addEventListener('change', loadData);
$('#brief-type-filter').addEventListener('change', renderBoard);
$('#brief-owner-filter').addEventListener('change', renderBoard);
$('#opportunity-filter').addEventListener('change', renderOpportunities);
$('#inventory-search').addEventListener('input', renderInventory);
$('#inventory-type').addEventListener('change', renderInventory);
$('#sidebar-toggle').addEventListener('click', () => document.body.classList.toggle('sidebar-open'));
document.addEventListener('click', (event) => {
  if (document.body.classList.contains('sidebar-open') && !event.target.closest('.admin-sidebar') && !event.target.closest('#sidebar-toggle')) document.body.classList.remove('sidebar-open');
});

clearForm();
loadData();
