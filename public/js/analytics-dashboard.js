const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const numberFa = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 1 });
const integerFa = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 0 });
const dateFa = new Intl.DateTimeFormat('fa-IR', { month: 'short', day: 'numeric' });
const dateTimeFa = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' });
const currencyFa = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 0 });

let growthReport = null;
let auditEntries = [];
let integrations = null;
let rawGoals = null;
let health = null;
let launchReadiness = null;
let currentView = location.hash.replace('#', '') || 'overview';
let chartResizeTimer;

function isoToday() {
  const parts = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function addDays(day, amount) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function setRange(days) {
  const to = isoToday();
  $('#range-to').value = to;
  $('#range-from').value = addDays(to, -(days - 1));
}

function queryString() {
  const params = new URLSearchParams();
  if ($('#range-from').value) params.set('from', $('#range-from').value);
  if ($('#range-to').value) params.set('to', $('#range-to').value);
  return params.toString();
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function formatNumber(value, digits = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return (digits ? numberFa : integerFa).format(number);
}

function formatPercent(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${numberFa.format(number)}٪` : '—';
}

function formatDuration(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value)) return '—';
  if (value < 60) return `${numberFa.format(value)} ثانیه`;
  if (value < 3_600) return `${numberFa.format(value / 60)} دقیقه`;
  return `${numberFa.format(value / 3_600)} ساعت`;
}

function formatRial(value, compact = false) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  if (compact) {
    const absolute = Math.abs(number);
    if (absolute >= 1_000_000_000) return `${numberFa.format(number / 1_000_000_000)} میلیارد ریال`;
    if (absolute >= 1_000_000) return `${numberFa.format(number / 1_000_000)} میلیون ریال`;
    if (absolute >= 1_000) return `${numberFa.format(number / 1_000)} هزار ریال`;
  }
  return `${currencyFa.format(number)} ریال`;
}

function compactNumber(value) {
  const number = Number(value) || 0;
  if (Math.abs(number) >= 1_000_000_000) return `${numberFa.format(number / 1_000_000_000)}B`;
  if (Math.abs(number) >= 1_000_000) return `${numberFa.format(number / 1_000_000)}M`;
  if (Math.abs(number) >= 1_000) return `${numberFa.format(number / 1_000)}K`;
  return numberFa.format(number);
}

function setStatus(message, state = '') {
  const element = $('#dashboard-status');
  element.textContent = message;
  element.className = `analytics-status ${state}`.trim();
}

function setMessage(selector, message, state = '') {
  const element = $(selector);
  if (!element) return;
  element.textContent = message;
  element.className = `form-message ${state}`.trim();
}

let notificationTimer;
function notify(message, state = 'ok') {
  let element = $('#admin-toast');
  if (!element) {
    element = document.createElement('div');
    element.id = 'admin-toast';
    element.setAttribute('role', state === 'error' ? 'alert' : 'status');
    element.setAttribute('aria-live', state === 'error' ? 'assertive' : 'polite');
    document.body.append(element);
  }
  element.textContent = String(message || '');
  element.className = `admin-toast is-visible ${state}`.trim();
  element.setAttribute('role', state === 'error' ? 'alert' : 'status');
  element.setAttribute('aria-live', state === 'error' ? 'assertive' : 'polite');
  clearTimeout(notificationTimer);
  notificationTimer = setTimeout(() => element.classList.remove('is-visible'), 3_600);
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
      message = body.error || body.message || message;
    } catch {
      // Keep status fallback.
    }
    throw new Error(message);
  }
  if (response.status === 204) return null;
  return response.json();
}

function emptyRows(columns, message = 'داده‌ای در این بازه ثبت نشده است.') {
  return `<tr><td class="empty-row" colspan="${columns}">${escapeHtml(message)}</td></tr>`;
}

function switchView(view, updateHash = true) {
  const valid = $(`[data-view-panel="${CSS.escape(view)}"]`) ? view : 'overview';
  currentView = valid;
  $$('.admin-nav-item').forEach((button) => button.classList.toggle('is-active', button.dataset.adminView === valid));
  $$('.view-panel').forEach((panel) => panel.classList.toggle('is-active', panel.dataset.viewPanel === valid));
  document.body.classList.remove('sidebar-open');
  if (updateHash) history.replaceState(null, '', `#${valid}`);
  requestAnimationFrame(redrawCharts);
}

function setDelta(selector, comparison, invert = false) {
  const element = $(selector);
  if (!element) return;
  const delta = Number(comparison?.delta) || 0;
  const improved = invert ? delta <= 0 : comparison?.improved;
  const sign = delta > 0 ? '+' : '';
  element.textContent = `${sign}${numberFa.format(delta)}٪ نسبت به بازهٔ قبل`;
  element.className = improved ? 'delta-up' : delta ? 'delta-down' : '';
}

function renderBars(selector, entries, formatter = formatNumber, limit = 10) {
  const root = $(selector);
  if (!root) return;
  const list = Array.isArray(entries) ? entries : [];
  if (!list.length) {
    root.innerHTML = '<div class="empty-row">داده‌ای وجود ندارد.</div>';
    return;
  }
  const max = Math.max(...list.map((entry) => Number(entry.value) || 0), 1);
  root.innerHTML = list.slice(0, limit).map((entry) => `
    <div class="bar-item" title="${escapeHtml(entry.name)}">
      <span>${escapeHtml(entry.name)}</span>
      <div class="bar-track"><i style="width:${Math.max(2, (Number(entry.value) || 0) / max * 100)}%"></i></div>
      <strong>${formatter(entry.value)}</strong>
    </div>
  `).join('');
}

function canvasContext(canvas) {
  const ratio = window.devicePixelRatio || 1;
  const rectangle = canvas.getBoundingClientRect();
  const width = Math.max(320, Math.round(rectangle.width));
  const height = Math.max(180, Math.round(rectangle.height));
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  const context = canvas.getContext('2d');
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { context, width, height };
}

function drawChart(canvas, rows, series, { currency = false, normalizeSeries = false, annotations = [] } = {}) {
  if (!canvas) return;
  const { context, width, height } = canvasContext(canvas);
  context.clearRect(0, 0, width, height);
  const padding = { top: 18, right: 12, bottom: 38, left: 58 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const values = rows.flatMap((row) => series.map((item) => Number(row[item.key]) || 0));
  const globalMax = Math.max(...values, 1);
  const seriesMax = Object.fromEntries(series.map((item) => [item.key, Math.max(...rows.map((row) => Number(row[item.key]) || 0), 1)]));

  context.strokeStyle = 'rgba(154,168,190,.14)';
  context.fillStyle = '#8796ad';
  context.font = '10px Tahoma, sans-serif';
  context.textAlign = 'left';
  context.textBaseline = 'middle';
  for (let step = 0; step <= 4; step += 1) {
    const y = padding.top + (plotHeight / 4) * step;
    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(width - padding.right, y);
    context.stroke();
    if (!normalizeSeries) {
      const value = globalMax * (1 - step / 4);
      context.fillText(currency ? compactNumber(value) : compactNumber(value), 4, y);
    }
  }

  if (!rows.length) {
    context.fillStyle = '#9aa8be';
    context.textAlign = 'center';
    context.fillText('داده‌ای برای نمایش وجود ندارد', width / 2, height / 2);
    return;
  }

  const xFor = (index) => padding.left + (rows.length === 1 ? plotWidth / 2 : index / (rows.length - 1) * plotWidth);
  const yFor = (value, key) => {
    const max = normalizeSeries ? seriesMax[key] : globalMax;
    return padding.top + plotHeight - (value / max) * plotHeight;
  };

  const annotationDates = new Set((annotations || []).map((entry) => entry.date));
  rows.forEach((row, index) => {
    if (!annotationDates.has(row.date)) return;
    const x = xFor(index);
    context.save();
    context.setLineDash([4, 4]);
    context.strokeStyle = '#f5c451';
    context.beginPath();
    context.moveTo(x, padding.top);
    context.lineTo(x, padding.top + plotHeight);
    context.stroke();
    context.restore();
  });

  series.forEach((item) => {
    const gradient = context.createLinearGradient(0, padding.top, 0, padding.top + plotHeight);
    gradient.addColorStop(0, `${item.color}3d`);
    gradient.addColorStop(1, `${item.color}00`);
    context.beginPath();
    rows.forEach((row, index) => {
      const x = xFor(index);
      const y = yFor(Number(row[item.key]) || 0, item.key);
      if (!index) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.strokeStyle = item.color;
    context.lineWidth = 2.2;
    context.lineJoin = 'round';
    context.lineCap = 'round';
    context.stroke();
    if (series.length === 1) {
      context.lineTo(xFor(rows.length - 1), padding.top + plotHeight);
      context.lineTo(xFor(0), padding.top + plotHeight);
      context.closePath();
      context.fillStyle = gradient;
      context.fill();
    }
  });

  const labelEvery = Math.max(1, Math.ceil(rows.length / 7));
  context.fillStyle = '#8796ad';
  context.textAlign = 'center';
  context.textBaseline = 'top';
  rows.forEach((row, index) => {
    if (index % labelEvery && index !== rows.length - 1) return;
    context.fillText(dateFa.format(new Date(`${row.date}T00:00:00Z`)), xFor(index), height - padding.bottom + 10);
  });
}

function renderAlerts(alerts) {
  const root = $('#alerts-list');
  const rows = alerts || [];
  $('#alert-count').textContent = `${formatNumber(rows.length)} مورد`;
  if (!rows.length) {
    root.innerHTML = '<div class="check-item pass"><div><strong>وضعیت پایدار است</strong><small>هشدار مهمی برای بازهٔ انتخاب‌شده ثبت نشده است.</small></div></div>';
    return;
  }
  root.innerHTML = rows.map((item) => `<button class="alert-card" type="button" data-severity="${escapeHtml(item.severity)}" data-alert-view="${escapeHtml(item.view || 'overview')}"><div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.detail)}</p><small>${escapeHtml(item.action)}</small></div></button>`).join('');
}

function renderFunnel(rows) {
  const root = $('#funnel-list');
  const max = Math.max(...(rows || []).map((row) => Number(row.value) || 0), 1);
  root.innerHTML = (rows || []).map((row) => `<div class="funnel-step"><span>${escapeHtml(row.label)}</span><div class="funnel-track"><i style="width:${Math.max(2, Number(row.value) / max * 100)}%">${formatPercent(row.overallRate)}</i></div><strong>${formatNumber(row.value)}</strong></div>`).join('') || '<div class="empty-row">داده‌ای برای قیف وجود ندارد.</div>';
}

function formatGoal(row) {
  if (row.unit === 'rial') return formatRial(row.value, true);
  if (row.unit === 'percent') return formatPercent(row.value);
  return formatNumber(row.value);
}

function renderGoals(rows) {
  const root = $('#goals-progress');
  root.innerHTML = (rows || []).map((row) => `<div class="goal-item ${row.configured ? '' : 'is-empty'}"><span>${escapeHtml(row.label)}</span><div class="goal-track"><i style="width:${Math.min(100, row.progress)}%"></i></div><strong>${row.configured ? `${formatGoal(row)} · ${formatPercent(row.progress)}` : 'هدف تنظیم نشده'}</strong></div>`).join('');
}

function renderAnnotations(rows) {
  const timeline = $('#annotation-timeline');
  const table = $('#annotations-table');
  if (!rows?.length) {
    timeline.innerHTML = '<div class="empty-row">برای تفسیر افت‌ها و رشدها، رویدادهای مهم را ثبت کنید.</div>';
    table.innerHTML = emptyRows(5);
    return;
  }
  timeline.innerHTML = rows.map((entry) => `<article class="annotation-chip"><span>${escapeHtml(entry.date)} · ${escapeHtml(entry.type)}</span><strong>${escapeHtml(entry.title)}</strong><p>${escapeHtml(entry.note || 'بدون توضیح')}</p></article>`).join('');
  table.innerHTML = rows.map((entry) => `<tr><td>${escapeHtml(entry.date)}</td><td>${escapeHtml(entry.type)}</td><td>${escapeHtml(entry.title)}</td><td>${escapeHtml(entry.note || '—')}</td><td><button class="a-button danger delete-annotation" type="button" data-id="${escapeHtml(entry.id)}">حذف</button></td></tr>`).join('');
}

function renderVitals(vitals) {
  const labels = {
    lcp: ['LCP', 'بارگذاری محتوای اصلی'],
    inp: ['INP', 'پاسخ‌گویی به تعامل'],
    cls: ['CLS', 'پایداری چیدمان'],
    ttfb: ['TTFB', 'پاسخ اولیه سرور'],
    fcp: ['FCP', 'اولین محتوای قابل مشاهده'],
  };
  $('#vitals-grid').innerHTML = Object.entries(labels).map(([key, [label, description]]) => {
    const metric = vitals?.[key] || {};
    const value = metric.p75;
    const formatted = value === null || value === undefined ? '—' : metric.unit === 'score' ? numberFa.format(value) : `${integerFa.format(value)} ms`;
    const state = metric.good === true ? 'good' : metric.good === false ? 'bad' : '';
    return `<div class="vital ${state}"><span>${label} · ${description}</span><strong>${formatted}</strong><small>صدک ۷۵ · هدف ${metric.unit === 'score' ? metric.goodThreshold : `${metric.goodThreshold} ms`}</small></div>`;
  }).join('');
}

function renderRevenue(entries) {
  const body = $('#revenue-table');
  if (!entries?.length) {
    body.innerHTML = emptyRows(7, 'عدد واقعی پنل ناشر هنوز ثبت نشده است.');
    return;
  }
  body.innerHTML = entries.map((entry) => `<tr><td>${escapeHtml(entry.date)}</td><td>${escapeHtml(entry.provider)}</td><td>${escapeHtml(entry.slot)}</td><td class="number">${formatNumber(entry.impressions)}</td><td class="number">${formatNumber(entry.clicks)}</td><td class="number">${formatRial(entry.revenueRial)}</td><td><button class="a-button danger delete-revenue" type="button" data-id="${escapeHtml(entry.id)}">حذف</button></td></tr>`).join('');
}

function renderRevenueBreakdown(summary) {
  const providers = summary.revenue?.byProvider || [];
  $('#provider-table').innerHTML = providers.length ? providers.map((row) => `<tr><td>${escapeHtml(row.name)}</td><td class="number">${formatRial(row.revenueRial)}</td><td class="number">${formatNumber(row.impressions)}</td><td class="number">${formatNumber(row.clicks)}</td><td class="number">${formatRial(row.impressions ? row.revenueRial / row.impressions * 1000 : 0)}</td></tr>`).join('') : emptyRows(5);
  const slots = summary.revenue?.bySlot || [];
  $('#slot-revenue-table').innerHTML = slots.length ? slots.map((row) => `<tr><td>${escapeHtml(row.name)}</td><td class="number">${formatRial(row.revenueRial)}</td><td class="number">${formatNumber(row.impressions)}</td><td class="number">${formatPercent(row.impressions ? row.clicks / row.impressions * 100 : 0)}</td><td class="number">${formatRial(row.impressions ? row.revenueRial / row.impressions * 1000 : 0)}</td></tr>`).join('') : emptyRows(5);
}

function renderAdSlots(rows) {
  const body = $('#ad-slots-table');
  body.innerHTML = rows?.length ? rows.map((row) => {
    const viewability = Number(row.views) ? Number(row.viewable || 0) / Number(row.views) * 100 : 0;
    return `<tr><td>${escapeHtml(row.name)}</td><td class="number">${formatNumber(row.views)}</td><td class="number">${formatNumber(row.viewable)}</td><td class="number">${formatPercent(viewability)}</td><td class="number">${formatNumber(row.loaded)}</td><td class="number">${formatNumber(row.errors)}</td><td class="number">${formatNumber(row.blocked)}</td></tr>`;
  }).join('') : emptyRows(7, 'تبلیغات هنوز فعال نشده یا جایگاهی دیده نشده است.');
}

function renderLaunchReadiness(report) {
  const score = Number(report?.score);
  $('#launch-readiness-score').textContent = Number.isFinite(score) ? formatNumber(score) : '—';
  $('#launch-readiness-summary').textContent = report?.summary || 'گزارش آمادگی در دسترس نیست.';
  const badge = $('#launch-readiness-badge');
  badge.textContent = report?.ready ? `آماده · ${report.grade}` : `${formatNumber(report?.counts?.blockers || 0)} مانع`;
  badge.classList.toggle('is-ready', Boolean(report?.ready));
  const list = $('#launch-readiness-list');
  list.innerHTML = (report?.checks || []).map((item) => `<div class="check-item ${item.status === 'blocker' ? 'fail' : item.status}"><div><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.detail)}</small><em>${escapeHtml(item.action)}</em></div></div>`).join('') || '<div class="empty-row">گزارش آمادگی موجود نیست.</div>';
}

function renderOpportunities(selector, rows, type) {
  const root = $(selector);
  if (!rows?.length) {
    root.innerHTML = '<div class="empty-row">فرصت معناداری در این بازه پیدا نشد.</div>';
    return;
  }
  root.innerHTML = rows.slice(0, 15).map((row) => {
    const note = type === 'ctr' ? `<em>+${formatNumber(row.missingClicks)} کلیک بالقوه</em>` : type === 'striking' ? '<em>مناسب برای تقویت محتوا</em>' : '<em>نیاز به صفحه یا پوشش بهتر</em>';
    return `<article class="opportunity-item" title="${escapeHtml(row.name)}"><strong>${escapeHtml(row.name)}</strong><div><span>${formatNumber(row.impressions)} نمایش</span><span>رتبه ${formatNumber(row.position, 1)}</span><span>CTR ${formatPercent(row.ctr)}</span>${note}</div></article>`;
  }).join('');
}

function contentSuggestion(row) {
  if (row.searchImpressions >= 100 && row.searchPosition <= 10 && row.searchCtr < 2) return 'بهبود Title و snippet';
  if (row.searchImpressions >= 50 && row.searchPosition > 3 && row.searchPosition <= 20) return 'گسترش محتوا و لینک داخلی';
  if (row.sessions >= 10 && row.editorOpenRate < 4) return 'تقویت مثال و CTA ادیتور';
  if (row.avgEngagementSeconds < 20 && row.sessions >= 10) return 'بهبود شروع و ساختار صفحه';
  return 'حفظ و توسعه تدریجی';
}

function renderContentMatrix(rows) {
  const body = $('#content-matrix-table');
  body.innerHTML = rows?.length ? rows.map((row) => `<tr><td dir="ltr">${escapeHtml(row.path)}</td><td class="number">${formatNumber(row.pageviews)}</td><td class="number">${formatDuration(row.avgEngagementSeconds)}</td><td class="number">${formatPercent(row.editorOpenRate)}</td><td class="number">${formatNumber(row.searchClicks)}</td><td class="number">${formatNumber(row.searchImpressions)}</td><td class="number">${formatPercent(row.searchCtr)}</td><td class="number">${row.searchPosition ? formatNumber(row.searchPosition, 1) : '—'}</td><td>${escapeHtml(contentSuggestion(row))}</td></tr>`).join('') : emptyRows(9);
}

function renderQueries(rows) {
  const body = $('#queries-table');
  body.innerHTML = rows?.length ? rows.slice(0, 60).map((row) => `<tr><td>${escapeHtml(row.name || '(بدون Query)')}</td><td class="number">${formatNumber(row.clicks)}</td><td class="number">${formatNumber(row.impressions)}</td><td class="number">${formatPercent(row.ctr)}</td><td class="number">${formatNumber(row.position, 1)}</td></tr>`).join('') : emptyRows(5, 'Search Console را متصل یا CSV را وارد کنید.');
}

function renderIntegrationCards(status) {
  const gsc = status?.searchConsole || {};
  const indexNow = status?.indexNow || {};
  const cards = [
    { name: 'Google Search Console', ok: gsc.configured, note: gsc.configured ? `${gsc.siteUrl || ''}${gsc.last?.syncedAt ? ` · آخرین sync ${dateTimeFa.format(new Date(gsc.last.syncedAt))}` : ''}` : 'Service account و GSC_SITE_URL تنظیم نشده‌اند.' },
    { name: 'IndexNow', ok: indexNow.configured, note: indexNow.configured ? `${indexNow.last?.submitted || 0} URL در آخرین ارسال` : 'کلید IndexNow تنظیم نشده است.' },
  ];
  $('#integration-cards').innerHTML = cards.map((card) => `<article class="integration-card"><header><strong>${card.name}</strong><span class="${card.ok ? 'ok' : ''}">${card.ok ? 'آماده' : 'غیرفعال'}</span></header><p>${escapeHtml(card.note)}</p></article>`).join('');
  $('#gsc-sync').disabled = !gsc.configured;
  $('#gsc-sync').title = gsc.configured ? '' : 'ابتدا تنظیمات Search Console را در سرور کامل کنید.';
  $('#submit-indexnow').disabled = !indexNow.configured;
  $('#indexnow-status').textContent = indexNow.configured ? 'IndexNow آمادهٔ ارسال است.' : 'IndexNow در تنظیمات سرور غیرفعال است.';
}

function renderAudit(history) {
  const latest = history?.[0];
  if (!latest) {
    $('#audit-score').textContent = '—';
    $('#audit-grade').textContent = 'بدون ممیزی';
    $('#audit-score-ring').style.setProperty('--score', 0);
    $('#audit-critical').textContent = '—';
    $('#audit-warning').textContent = '—';
    $('#audit-passed').textContent = '—';
    $('#audit-last-run').textContent = 'برای ساخت baseline ممیزی را اجرا کنید.';
    $('#audit-issues').innerHTML = '<div class="empty-row">هنوز گزارشی وجود ندارد.</div>';
    $('#audit-pages-table').innerHTML = emptyRows(9);
    $('#global-checks').innerHTML = '<div class="empty-row">هنوز گزارشی وجود ندارد.</div>';
    return;
  }
  $('#audit-score').textContent = formatNumber(latest.score);
  $('#audit-grade').textContent = `رتبه ${latest.grade}`;
  $('#audit-score-ring').style.setProperty('--score', latest.score);
  $('#audit-critical').textContent = formatNumber(latest.counts?.critical);
  $('#audit-warning').textContent = formatNumber(latest.counts?.warning);
  $('#audit-passed').textContent = formatNumber(latest.counts?.passedPages);
  $('#audit-last-run').textContent = `آخرین اجرا: ${dateTimeFa.format(new Date(latest.runAt))} · ${formatNumber(latest.durationMs)} ms`;
  $('#audit-issues').innerHTML = latest.issues?.length ? latest.issues.map((issue) => `<article class="audit-issue" data-severity="${escapeHtml(issue.severity)}"><header><strong>${escapeHtml(issue.title)}</strong><code>${escapeHtml(issue.route)}</code></header><p>${escapeHtml(issue.detail)}</p><small>${escapeHtml(issue.fix)}</small></article>`).join('') : '<div class="check-item pass"><div><strong>خطای مهمی پیدا نشد</strong><small>ممیزی فعلی از نظر فنی پایدار است.</small></div></div>';
  $('#audit-pages-table').innerHTML = latest.pages?.length ? latest.pages.map((page) => {
    const className = page.score >= 90 ? '' : page.score >= 70 ? 'warning' : 'bad';
    const canonicalOk = page.checks?.find((item) => item.key === 'canonical')?.status === 'pass';
    return `<tr><td dir="ltr">${escapeHtml(page.route)}</td><td><span class="score-badge ${className}">${formatNumber(page.score)}</span></td><td class="number">${formatNumber(page.status)}</td><td class="number">${formatNumber(page.responseMs)} ms</td><td class="number">${formatNumber(page.bytes / 1024, 1)} KB</td><td class="number">${formatNumber(page.wordCount)}</td><td class="number">${formatNumber(page.h1?.length)}</td><td>${escapeHtml(page.schema?.types?.join(', ') || '—')}</td><td>${canonicalOk ? '✓' : '✕'}</td></tr>`;
  }).join('') : emptyRows(9);
  $('#global-checks').innerHTML = (latest.globalChecks || []).map((item) => `<div class="check-item ${escapeHtml(item.status)}"><div><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.detail)}</small></div></div>`).join('');
}

function renderDataHealth() {
  const analytics = health?.analytics || {};
  const checks = [
    ['ذخیره‌سازی آنالیتیکس', analytics.enabled && !analytics.lastError, analytics.lastError || (analytics.enabled ? 'فعال و بدون خطای ثبت‌شده' : 'غیرفعال')],
    ['رمز پنل مدیریت', analytics.adminConfigured, analytics.adminConfigured ? 'رمز طولانی تنظیم شده است.' : 'رمز معتبر تنظیم نشده است.'],
    ['Secret پایدار HMAC', analytics.persistentHashSecret, analytics.persistentHashSecret ? 'شناسه‌های روزانه پس از restart پایدار می‌مانند.' : 'ANALYTICS_HASH_SECRET را تنظیم کنید.'],
    ['Search Console API', integrations?.searchConsole?.configured, integrations?.searchConsole?.configured ? 'اتصال مستقیم آماده است.' : 'ورود CSV همچنان قابل استفاده است.'],
    ['IndexNow', integrations?.indexNow?.configured, integrations?.indexNow?.configured ? 'کلید و SITE_URL معتبرند.' : 'اختیاری و غیرفعال'],
  ];
  $('#data-health-list').innerHTML = checks.map(([label, ok, note]) => `<div class="check-item ${ok ? 'pass' : 'warning'}"><div><strong>${escapeHtml(label)}</strong><small>${escapeHtml(note)}</small></div></div>`).join('');
  const dot = $('#sidebar-health-dot');
  const unhealthy = analytics.lastError || !analytics.adminConfigured || !analytics.persistentHashSecret;
  dot.className = `health-dot ${unhealthy ? 'error' : 'ok'}`;
  $('#sidebar-health-title').textContent = unhealthy ? 'نیاز به بررسی تنظیمات' : 'سرویس سالم است';
  $('#sidebar-health-note').textContent = health?.version ? `نسخه ${health.version}` : 'وضعیت سرویس و داده';
}

function populateGoals(goals) {
  rawGoals = goals || {};
  const form = $('#goals-form');
  for (const [key, value] of Object.entries(rawGoals)) {
    const input = form.elements.namedItem(key);
    if (input) input.value = value || '';
  }
}

function renderOverview(report) {
  const summary = report.current;
  const totals = summary.totals || {};
  const rates = summary.rates || {};
  $('#kpi-pageviews').textContent = formatNumber(totals.pageviews);
  $('#kpi-sessions').textContent = formatNumber(totals.sessions);
  $('#kpi-revenue').textContent = formatRial(totals.actualRevenueRial, true);
  $('#kpi-rpm').textContent = formatRial(rates.pageRpmRial, true);
  $('#kpi-search-clicks').textContent = formatNumber(totals.searchClicks);
  $('#kpi-exports').textContent = formatNumber(totals.exports);
  $('#kpi-forecast').textContent = formatRial(summary.forecast?.next30DaysRial, true);
  const latestAudit = auditEntries[0];
  $('#kpi-seo-score').textContent = latestAudit ? `${formatNumber(latestAudit.score)}/۱۰۰` : '—';
  $('#kpi-seo-grade').textContent = latestAudit ? `رتبه ${latestAudit.grade}` : 'ممیزی اجرا نشده';
  setDelta('#delta-pageviews', report.comparison?.pageviews);
  setDelta('#delta-sessions', report.comparison?.sessions);
  setDelta('#delta-revenue', report.comparison?.revenueRial);
  setDelta('#delta-rpm', report.comparison?.pageRpmRial);
  setDelta('#delta-search', report.comparison?.searchClicks);
  setDelta('#delta-exports', report.comparison?.exports);
  renderAlerts(report.alerts);
  renderFunnel(report.funnel);
  renderGoals(report.goals);
  renderAnnotations(report.annotations);
  $('#opportunity-clicks').textContent = formatNumber(report.executive?.opportunityClicks);
  $('#opportunity-striking').textContent = formatNumber(report.opportunities?.strikingDistance?.length);
  $('#opportunity-gaps').textContent = formatNumber(report.opportunities?.contentGaps?.length);
}

function renderRevenueView(summary) {
  const totals = summary.totals || {};
  const rates = summary.rates || {};
  $('#revenue-total').textContent = formatRial(totals.actualRevenueRial, true);
  $('#revenue-period-note').textContent = `${summary.from} تا ${summary.to}`;
  $('#metric-ecpm').textContent = formatRial(rates.ecpmRial, true);
  $('#metric-cpc').textContent = formatRial(rates.cpcRial, true);
  $('#metric-ad-ctr').textContent = formatPercent(rates.ctr);
  $('#metric-fill-rate').textContent = formatPercent(rates.fillRate);
  $('#metric-session-rpm').textContent = formatRial(rates.sessionRpmRial, true);
  const editorSlots = (summary.adSlots || []).filter((row) => String(row.name).startsWith('editor'));
  const editorViews = editorSlots.reduce((sum, row) => sum + Number(row.views || 0), 0);
  const editorViewable = editorSlots.reduce((sum, row) => sum + Number(row.viewable || 0), 0);
  $('#metric-editor-viewable').textContent = formatNumber(editorViewable);
  $('#metric-editor-viewability').textContent = formatPercent(editorViews ? editorViewable / editorViews * 100 : 0);
  renderRevenueBreakdown(summary);
  renderAdSlots(summary.adSlots);
  renderRevenue(summary.revenue?.entries);
}

function renderSeoView(report) {
  const summary = report.current;
  $('#seo-clicks').textContent = formatNumber(summary.totals?.searchClicks);
  $('#seo-impressions').textContent = formatNumber(summary.totals?.searchImpressions);
  $('#seo-ctr').textContent = formatPercent(summary.rates?.searchCtr);
  $('#seo-position').textContent = formatNumber(summary.rates?.averageSearchPosition, 1);
  $('#seo-ctr-opportunities').textContent = formatNumber(report.opportunities?.ctr?.length);
  $('#seo-content-pages').textContent = formatNumber(report.contentMatrix?.length);
  setDelta('#seo-click-delta', report.comparison?.searchClicks);
  renderOpportunities('#ctr-opportunities', report.opportunities?.ctr, 'ctr');
  renderOpportunities('#striking-opportunities', report.opportunities?.strikingDistance, 'striking');
  renderOpportunities('#gap-opportunities', report.opportunities?.contentGaps, 'gap');
  renderContentMatrix(report.contentMatrix);
  renderQueries(summary.search?.topQueries);
}

function renderPerformance(summary) {
  const rates = summary.rates || {};
  $('#metric-bounce').textContent = formatPercent(rates.bounceRate);
  $('#metric-engagement').textContent = formatDuration(rates.avgEngagementSeconds);
  $('#metric-editor-rate').textContent = formatPercent(rates.editorOpenRate);
  $('#metric-render-rate').textContent = formatPercent(rates.renderSuccessRate);
  renderVitals(summary.vitals);
  renderBars('#exports-bars', Object.entries(summary.exportsByFormat || {}).map(([name, value]) => ({ name: name.toUpperCase(), value })));
  renderBars('#channels-bars', summary.channels);
  renderBars('#referrer-bars', summary.referrers);
  renderBars('#devices-bars', summary.devices);
  renderBars('#browsers-bars', summary.browsers);
  renderBars('#os-bars', summary.operatingSystems);
}

function redrawCharts() {
  if (!growthReport) return;
  const summary = growthReport.current;
  if (currentView === 'overview') {
    drawChart($('#traffic-chart'), summary.daily || [], [
      { key: 'pageviews', color: '#62b4ff' },
      { key: 'sessions', color: '#9c78ff' },
      { key: 'visitors', color: '#43d8a4' },
    ], { annotations: growthReport.annotations });
    drawChart($('#revenue-chart'), summary.daily || [], [{ key: 'revenueRial', color: '#f067a0' }], { currency: true });
  }
  if (currentView === 'revenue') {
    drawChart($('#ad-chart'), summary.daily || [], [
      { key: 'revenueRial', color: '#f067a0' },
      { key: 'impressions', color: '#62b4ff' },
      { key: 'clicks', color: '#f5c451' },
    ], { normalizeSeries: true });
  }
  if (currentView === 'seo') {
    drawChart($('#search-chart'), summary.daily || [], [
      { key: 'searchClicks', color: '#43d8a4' },
      { key: 'searchImpressions', color: '#62b4ff' },
    ], { normalizeSeries: true });
  }
  if (currentView === 'audit') {
    const history = [...auditEntries].reverse().map((entry) => ({ date: entry.runAt.slice(0, 10), score: entry.score }));
    drawChart($('#audit-history-chart'), history, [{ key: 'score', color: '#43d8a4' }]);
  }
}

function renderAll() {
  if (!growthReport) return;
  renderOverview(growthReport);
  renderRevenueView(growthReport.current);
  renderSeoView(growthReport);
  renderPerformance(growthReport.current);
  renderIntegrationCards(integrations);
  renderAudit(auditEntries);
  renderDataHealth();
  renderLaunchReadiness(launchReadiness);
  $('#export-dashboard').href = `/api/admin/analytics/export.csv?${queryString()}`;
  $('#export-dashboard-secondary').href = `/api/admin/analytics/export.csv?${queryString()}`;
  setStatus(`آخرین به‌روزرسانی: ${new Date().toLocaleTimeString('fa-IR')}`, 'ok');
  requestAnimationFrame(redrawCharts);
}

async function loadDashboard() {
  const button = $('#refresh-dashboard');
  button.disabled = true;
  setStatus('در حال دریافت و تحلیل داده…');
  try {
    const query = queryString();
    const [growth, audits, integrationStatus, goals, serviceHealth, readiness] = await Promise.all([
      api(`/api/admin/growth/overview?${query}`),
      api('/api/admin/seo/audits?limit=40'),
      api('/api/admin/integrations/status'),
      api('/api/admin/goals'),
      api('/api/health'),
      api('/api/admin/launch/readiness'),
    ]);
    growthReport = growth;
    auditEntries = audits.entries || audits || [];
    integrations = integrationStatus;
    health = serviceHealth;
    launchReadiness = readiness;
    populateGoals(goals);
    renderAll();
  } catch (error) {
    setStatus(error.message || 'دریافت داده ناموفق بود.', 'error');
  } finally {
    button.disabled = false;
  }
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') { cell += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else cell += character;
    } else if (character === '"') quoted = true;
    else if (character === ',') { row.push(cell.trim()); cell = ''; }
    else if (character === '\n') { row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); row = []; cell = ''; }
    else if (character !== '\r') cell += character;
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function normalizeHeader(value) {
  return String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
}

function searchRowsFromCsv(text, defaultDate) {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error('CSV باید سربرگ و حداقل یک ردیف داده داشته باشد.');
  const aliases = {
    date: ['date', 'تاریخ'], query: ['query', 'topqueries', 'queries', 'کوئری', 'عبارتجستجو', 'عبارت'],
    page: ['page', 'toppages', 'pages', 'صفحه', 'آدرسصفحه'], clicks: ['clicks', 'کلیک', 'کلیکها'],
    impressions: ['impressions', 'نمایش', 'نمایشها'], position: ['position', 'avgposition', 'جایگاه', 'موقعیت', 'میانگینجایگاه'],
  };
  const normalizedHeaders = rows[0].map(normalizeHeader);
  const indexFor = (name) => normalizedHeaders.findIndex((header) => aliases[name].map(normalizeHeader).includes(header));
  const indexes = Object.fromEntries(Object.keys(aliases).map((name) => [name, indexFor(name)]));
  if (indexes.clicks < 0 || indexes.impressions < 0 || (indexes.query < 0 && indexes.page < 0)) throw new Error('ستون‌های query/page، clicks و impressions پیدا نشدند.');
  return rows.slice(1).map((values) => {
    const read = (name) => indexes[name] >= 0 ? values[indexes[name]] : '';
    return {
      date: read('date') || defaultDate,
      query: read('query'), page: read('page'),
      clicks: Number(String(read('clicks')).replace(/[,\s]/g, '')) || 0,
      impressions: Number(String(read('impressions')).replace(/[,٪%\s]/g, '')) || 0,
      position: Number(String(read('position')).replace(/[,\s]/g, '')) || 0,
    };
  }).filter((row) => row.query || row.page);
}

$('#revenue-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const entry = { date: form.get('date'), provider: form.get('provider'), slot: form.get('slot'), impressions: Number(form.get('impressions')) || 0, clicks: Number(form.get('clicks')) || 0, revenueRial: Number(form.get('revenueRial')) || 0, note: form.get('note'), source: 'dashboard' };
  setMessage('#revenue-message', 'در حال ثبت…');
  try {
    await api('/api/admin/analytics/revenue', { method: 'POST', body: JSON.stringify({ entries: [entry] }) });
    setMessage('#revenue-message', 'درآمد ثبت شد.', 'ok');
    $('#revenue-rial').value = '';
    await loadDashboard();
  } catch (error) { setMessage('#revenue-message', error.message, 'error'); }
});

$('#revenue-table').addEventListener('click', async (event) => {
  const button = event.target.closest('.delete-revenue');
  if (!button || !confirm('این رکورد درآمد حذف شود؟')) return;
  button.disabled = true;
  try { await api(`/api/admin/analytics/revenue/${encodeURIComponent(button.dataset.id)}`, { method: 'DELETE' }); await loadDashboard(); }
  catch (error) { notify(error.message, 'error'); button.disabled = false; }
});

$('#search-import-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  setMessage('#search-message', 'در حال پردازش…');
  try {
    const defaultDate = $('#search-default-date').value || isoToday();
    const rows = searchRowsFromCsv($('#search-csv').value, defaultDate);
    await api('/api/admin/analytics/search', { method: 'POST', body: JSON.stringify({ rows, defaultDate }) });
    setMessage('#search-message', `${formatNumber(rows.length)} ردیف وارد شد.`, 'ok');
    await loadDashboard();
  } catch (error) { setMessage('#search-message', error.message, 'error'); }
});

$('#gsc-sync').addEventListener('click', async () => {
  const button = $('#gsc-sync');
  button.disabled = true;
  button.textContent = 'در حال همگام‌سازی…';
  try {
    const result = await api('/api/admin/seo/search-console/sync', { method: 'POST', body: JSON.stringify({ from: $('#range-from').value, to: $('#range-to').value }) });
    notify(`${formatNumber(result.imported)} ردیف نهایی Search Console همگام شد.`);
    await loadDashboard();
  } catch (error) { notify(error.message, 'error'); }
  finally { button.textContent = 'همگام‌سازی Search Console'; button.disabled = !integrations?.searchConsole?.configured; }
});

$('#run-seo-audit').addEventListener('click', async () => {
  const button = $('#run-seo-audit');
  button.disabled = true;
  button.textContent = 'در حال خزیدن صفحات…';
  try {
    const result = await api('/api/admin/seo/audit/run', { method: 'POST', body: JSON.stringify({}) });
    notify(`ممیزی با امتیاز ${formatNumber(result.score)} از ۱۰۰ کامل شد.`);
    await loadDashboard();
    switchView('audit');
  } catch (error) { notify(error.message, 'error'); }
  finally { button.disabled = false; button.textContent = 'اجرای ممیزی کامل'; }
});

$('#submit-indexnow').addEventListener('click', async () => {
  const button = $('#submit-indexnow');
  button.disabled = true;
  setMessage('#indexnow-message', 'در حال ارسال URLها…');
  try {
    const result = await api('/api/admin/seo/indexnow', { method: 'POST', body: JSON.stringify({}) });
    setMessage('#indexnow-message', `${formatNumber(result.submitted)} URL پذیرفته شد.`, 'ok');
    await loadDashboard();
  } catch (error) { setMessage('#indexnow-message', error.message, 'error'); }
  finally { button.disabled = !integrations?.indexNow?.configured; }
});

$('#goals-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.currentTarget).entries());
  setMessage('#goals-message', 'در حال ذخیره…');
  try {
    await api('/api/admin/goals', { method: 'PUT', body: JSON.stringify(values) });
    setMessage('#goals-message', 'هدف‌ها ذخیره شدند.', 'ok');
    await loadDashboard();
  } catch (error) { setMessage('#goals-message', error.message, 'error'); }
});

$('#annotation-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.currentTarget).entries());
  setMessage('#annotation-message', 'در حال ثبت…');
  try {
    await api('/api/admin/annotations', { method: 'POST', body: JSON.stringify(values) });
    event.currentTarget.elements.title.value = '';
    event.currentTarget.elements.note.value = '';
    setMessage('#annotation-message', 'رویداد ثبت شد.', 'ok');
    await loadDashboard();
  } catch (error) { setMessage('#annotation-message', error.message, 'error'); }
});

$('#annotations-table').addEventListener('click', async (event) => {
  const button = event.target.closest('.delete-annotation');
  if (!button || !confirm('این رویداد حذف شود؟')) return;
  try { await api(`/api/admin/annotations/${encodeURIComponent(button.dataset.id)}`, { method: 'DELETE' }); await loadDashboard(); }
  catch (error) { notify(error.message, 'error'); }
});

$('#copy-backup-command').addEventListener('click', async () => {
  const command = `docker run --rm -v mermaid-studio_analytics_data:/source:ro -v "$PWD/backups:/backup" alpine sh -c 'tar czf /backup/analytics-$(date +%F).tar.gz -C /source .'`;
  try { await navigator.clipboard.writeText(command); $('#copy-backup-command').textContent = 'کپی شد'; setTimeout(() => { $('#copy-backup-command').textContent = 'کپی فرمان Backup'; }, 1500); }
  catch { alert(command); }
});

$$('.admin-nav-item').forEach((button) => button.addEventListener('click', () => switchView(button.dataset.adminView)));
$$('[data-jump-view]').forEach((button) => button.addEventListener('click', () => switchView(button.dataset.jumpView)));
$('#alerts-list').addEventListener('click', (event) => { const card = event.target.closest('[data-alert-view]'); if (card) switchView(card.dataset.alertView); });
$('#sidebar-toggle').addEventListener('click', () => document.body.classList.toggle('sidebar-open'));
document.addEventListener('click', (event) => { if (document.body.classList.contains('sidebar-open') && !event.target.closest('.admin-sidebar') && !event.target.closest('#sidebar-toggle')) document.body.classList.remove('sidebar-open'); });
$('#range-preset').addEventListener('change', (event) => { if (event.target.value !== 'custom') setRange(Number(event.target.value)); });
$('#range-from').addEventListener('change', () => { $('#range-preset').value = 'custom'; });
$('#range-to').addEventListener('change', () => { $('#range-preset').value = 'custom'; });
$('#refresh-dashboard').addEventListener('click', loadDashboard);
window.addEventListener('hashchange', () => switchView(location.hash.replace('#', ''), false));
window.addEventListener('resize', () => { clearTimeout(chartResizeTimer); chartResizeTimer = setTimeout(redrawCharts, 160); });

setRange(30);
$('#revenue-date').value = isoToday();
$('#search-default-date').value = isoToday();
$('#annotation-date').value = isoToday();
switchView(currentView, false);
loadDashboard();
