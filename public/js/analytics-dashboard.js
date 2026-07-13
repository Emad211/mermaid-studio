const $ = (selector) => document.querySelector(selector);
const numberFa = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 1 });
const integerFa = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 0 });
const dateFa = new Intl.DateTimeFormat('fa-IR', { month: 'short', day: 'numeric' });
const currencyFa = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 0 });

let currentSummary = null;
let chartResizeTimer;

function isoToday() {
  return new Date().toISOString().slice(0, 10);
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
  return `${numberFa.format(value / 60)} دقیقه`;
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

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function setStatus(message, state = '') {
  const element = $('#dashboard-status');
  element.textContent = message;
  element.className = `analytics-status ${state}`.trim();
}

function queryString() {
  const params = new URLSearchParams();
  if ($('#range-from').value) params.set('from', $('#range-from').value);
  if ($('#range-to').value) params.set('to', $('#range-to').value);
  return params.toString();
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
      // Keep the HTTP status as the fallback.
    }
    throw new Error(message);
  }
  if (response.status === 204) return null;
  return response.json();
}

function emptyRows(columns, message = 'داده‌ای در این بازه ثبت نشده است.') {
  return `<tr><td class="empty-row" colspan="${columns}">${escapeHtml(message)}</td></tr>`;
}

function renderBars(selector, entries, formatter = formatNumber) {
  const root = $(selector);
  const list = Array.isArray(entries) ? entries : [];
  if (!list.length) {
    root.innerHTML = '<div class="empty-row">داده‌ای وجود ندارد.</div>';
    return;
  }
  const max = Math.max(...list.map((entry) => Number(entry.value) || 0), 1);
  root.innerHTML = list.slice(0, 10).map((entry) => `
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

function drawChart(canvas, rows, series, { currency = false } = {}) {
  const { context, width, height } = canvasContext(canvas);
  context.clearRect(0, 0, width, height);
  const padding = { top: 18, right: 12, bottom: 38, left: 58 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const values = rows.flatMap((row) => series.map((item) => Number(row[item.key]) || 0));
  const max = Math.max(...values, 1);

  context.strokeStyle = 'rgba(154,165,186,.15)';
  context.fillStyle = '#9aa5ba';
  context.font = '10px Tahoma, sans-serif';
  context.textAlign = 'left';
  context.textBaseline = 'middle';
  for (let step = 0; step <= 4; step += 1) {
    const y = padding.top + (plotHeight / 4) * step;
    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(width - padding.right, y);
    context.stroke();
    const value = max * (1 - step / 4);
    context.fillText(currency ? compactAxisRial(value) : compactNumber(value), 4, y);
  }

  if (!rows.length) {
    context.fillStyle = '#9aa5ba';
    context.textAlign = 'center';
    context.fillText('داده‌ای برای نمایش وجود ندارد', width / 2, height / 2);
    return;
  }

  const xFor = (index) => padding.left + (rows.length === 1 ? plotWidth / 2 : index / (rows.length - 1) * plotWidth);
  const yFor = (value) => padding.top + plotHeight - (value / max) * plotHeight;

  series.forEach((item) => {
    const gradient = context.createLinearGradient(0, padding.top, 0, padding.top + plotHeight);
    gradient.addColorStop(0, `${item.color}44`);
    gradient.addColorStop(1, `${item.color}00`);
    context.beginPath();
    rows.forEach((row, index) => {
      const x = xFor(index);
      const y = yFor(Number(row[item.key]) || 0);
      if (index === 0) context.moveTo(x, y);
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
  context.fillStyle = '#9aa5ba';
  context.textAlign = 'center';
  context.textBaseline = 'top';
  rows.forEach((row, index) => {
    if (index % labelEvery && index !== rows.length - 1) return;
    const date = new Date(`${row.date}T00:00:00Z`);
    context.fillText(dateFa.format(date), xFor(index), height - padding.bottom + 10);
  });
}

function compactNumber(value) {
  if (value >= 1_000_000) return `${numberFa.format(value / 1_000_000)}M`;
  if (value >= 1_000) return `${numberFa.format(value / 1_000)}K`;
  return numberFa.format(value);
}

function compactAxisRial(value) {
  if (value >= 1_000_000_000) return `${numberFa.format(value / 1_000_000_000)}B`;
  if (value >= 1_000_000) return `${numberFa.format(value / 1_000_000)}M`;
  if (value >= 1_000) return `${numberFa.format(value / 1_000)}K`;
  return numberFa.format(value);
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
    const formatted = value === null || value === undefined ? '—'
      : metric.unit === 'score' ? numberFa.format(value) : `${integerFa.format(value)} ms`;
    const state = metric.good === true ? 'good' : metric.good === false ? 'bad' : '';
    return `<div class="vital ${state}"><span>${label} · ${description}</span><strong>${formatted}</strong><small>صدک ۷۵ · هدف ${metric.unit === 'score' ? metric.goodThreshold : `${metric.goodThreshold} ms`}</small></div>`;
  }).join('');
}

function renderPages(rows) {
  const body = $('#pages-table');
  if (!rows?.length) {
    body.innerHTML = emptyRows(4);
    return;
  }
  body.innerHTML = rows.map((row) => `<tr><td dir="ltr">${escapeHtml(row.name)}</td><td class="number">${formatNumber(row.pageviews)}</td><td class="number">${formatNumber(row.sessions)}</td><td class="number">${formatDuration(row.engagementSeconds)}</td></tr>`).join('');
}

function renderQueries(rows) {
  const body = $('#queries-table');
  if (!rows?.length) {
    body.innerHTML = emptyRows(5, 'پس از خروجی گرفتن از Search Console، CSV را وارد کنید.');
    return;
  }
  body.innerHTML = rows.slice(0, 50).map((row) => `<tr><td>${escapeHtml(row.name || '(صفحه بدون کوئری)')}</td><td class="number">${formatNumber(row.clicks)}</td><td class="number">${formatNumber(row.impressions)}</td><td class="number">${formatPercent(row.ctr)}</td><td class="number">${formatNumber(row.position, 1)}</td></tr>`).join('');
}

function renderAdSlots(rows) {
  const body = $('#ad-slots-table');
  if (!rows?.length) {
    body.innerHTML = emptyRows(5, 'تبلیغات هنوز فعال نشده یا جایگاهی در دید کاربر قرار نگرفته است.');
    return;
  }
  body.innerHTML = rows.map((row) => `<tr><td>${escapeHtml(row.name)}</td><td class="number">${formatNumber(row.views)}</td><td class="number">${formatNumber(row.loaded)}</td><td class="number">${formatNumber(row.errors)}</td><td class="number">${formatNumber(row.blocked)}</td></tr>`).join('');
}

function renderRevenue(entries) {
  const body = $('#revenue-table');
  if (!entries?.length) {
    body.innerHTML = emptyRows(7, 'عدد واقعی پنل ناشر هنوز ثبت نشده است.');
    return;
  }
  body.innerHTML = entries.map((entry) => `<tr>
    <td>${escapeHtml(entry.date)}</td><td>${escapeHtml(entry.provider)}</td><td>${escapeHtml(entry.slot)}</td>
    <td class="number">${formatNumber(entry.impressions)}</td><td class="number">${formatNumber(entry.clicks)}</td>
    <td class="number">${formatRial(entry.revenueRial)}</td>
    <td><button class="a-button danger delete-revenue" type="button" data-id="${escapeHtml(entry.id)}">حذف</button></td>
  </tr>`).join('');
}

function render(summary) {
  currentSummary = summary;
  const totals = summary.totals || {};
  const rates = summary.rates || {};
  $('#kpi-pageviews').textContent = formatNumber(totals.pageviews);
  $('#kpi-sessions').textContent = formatNumber(totals.sessions);
  $('#kpi-bounce').textContent = `نرخ پرش ${formatPercent(rates.bounceRate)}`;
  $('#kpi-revenue').textContent = formatRial(totals.actualRevenueRial, true);
  $('#kpi-rpm').textContent = `RPM صفحه ${formatRial(rates.pageRpmRial, true)}`;
  $('#kpi-exports').textContent = formatNumber(totals.exports);
  $('#kpi-exports-rate').textContent = `${formatNumber(rates.exportsPerSession, 1)} خروجی به‌ازای جلسه`;
  $('#kpi-search-clicks').textContent = formatNumber(totals.searchClicks);
  $('#kpi-search-ctr').textContent = `CTR جست‌وجو ${formatPercent(rates.searchCtr)}`;
  $('#kpi-forecast').textContent = formatRial(summary.forecast?.next30DaysRial, true);

  $('#metric-engagement').textContent = formatDuration(rates.avgEngagementSeconds);
  $('#metric-editor-rate').textContent = formatPercent(rates.editorOpenRate);
  $('#metric-render-rate').textContent = formatPercent(rates.renderSuccessRate);
  $('#metric-ecpm').textContent = formatRial(rates.ecpmRial, true);
  $('#metric-cpc').textContent = formatRial(rates.cpcRial, true);
  $('#metric-ad-ctr').textContent = formatPercent(rates.ctr);
  $('#metric-search-impressions').textContent = formatNumber(totals.searchImpressions);
  $('#metric-search-ctr').textContent = formatPercent(rates.searchCtr);
  $('#metric-search-position').textContent = formatNumber(rates.averageSearchPosition, 1);

  renderBars('#exports-bars', Object.entries(summary.exportsByFormat || {}).map(([name, value]) => ({ name: name.toUpperCase(), value })));
  renderBars('#channels-bars', summary.channels);
  renderBars('#referrer-bars', summary.referrers);
  renderBars('#devices-bars', summary.devices);
  renderBars('#browsers-bars', summary.browsers);
  renderVitals(summary.vitals);
  renderPages(summary.topPages);
  renderQueries(summary.search?.topQueries);
  renderAdSlots(summary.adSlots);
  renderRevenue(summary.revenue?.entries);

  drawChart($('#traffic-chart'), summary.daily || [], [
    { key: 'pageviews', color: '#63b3ff' },
    { key: 'sessions', color: '#9b6df3' },
    { key: 'visitors', color: '#38d39f' },
  ]);
  drawChart($('#revenue-chart'), summary.daily || [], [{ key: 'revenueRial', color: '#f067a0' }], { currency: true });

  $('#export-dashboard').href = `/api/admin/analytics/export.csv?${queryString()}`;
  setStatus(`آخرین بروزرسانی: ${new Date().toLocaleTimeString('fa-IR')}`, 'ok');
}

async function loadDashboard() {
  const button = $('#refresh-dashboard');
  button.disabled = true;
  setStatus('در حال دریافت داده…');
  try {
    const summary = await api(`/api/admin/analytics/summary?${queryString()}`);
    if (!summary.enabled) throw new Error('آنالیتیکس در تنظیمات سرور غیرفعال است.');
    render(summary);
  } catch (error) {
    setStatus(error.message || 'دریافت داده ناموفق بود.', 'error');
  } finally {
    button.disabled = false;
  }
}

function setMessage(selector, message, state = '') {
  const element = $(selector);
  element.textContent = message;
  element.className = `form-message ${state}`.trim();
}

$('#revenue-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const entry = {
    date: form.get('date'),
    provider: form.get('provider'),
    slot: form.get('slot'),
    impressions: Number(form.get('impressions')) || 0,
    clicks: Number(form.get('clicks')) || 0,
    revenueRial: Number(form.get('revenueRial')) || 0,
    note: form.get('note'),
    source: 'dashboard',
  };
  setMessage('#revenue-message', 'در حال ثبت…');
  try {
    await api('/api/admin/analytics/revenue', { method: 'POST', body: JSON.stringify({ entries: [entry] }) });
    setMessage('#revenue-message', 'درآمد ثبت شد.', 'ok');
    $('#revenue-rial').value = '';
    await loadDashboard();
  } catch (error) {
    setMessage('#revenue-message', error.message, 'error');
  }
});

$('#revenue-table').addEventListener('click', async (event) => {
  const button = event.target.closest('.delete-revenue');
  if (!button || !confirm('این رکورد درآمد حذف شود؟')) return;
  button.disabled = true;
  try {
    await api(`/api/admin/analytics/revenue/${encodeURIComponent(button.dataset.id)}`, { method: 'DELETE' });
    await loadDashboard();
  } catch (error) {
    alert(error.message);
    button.disabled = false;
  }
});

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else cell += character;
    } else if (character === '"') quoted = true;
    else if (character === ',') {
      row.push(cell.trim());
      cell = '';
    } else if (character === '\n') {
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = '';
    } else if (character !== '\r') cell += character;
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
    date: ['date', 'تاریخ'],
    query: ['query', 'topqueries', 'queries', 'کوئری', 'عبارتجستجو', 'عبارت'],
    page: ['page', 'toppages', 'pages', 'صفحه', 'آدرسصفحه'],
    clicks: ['clicks', 'کلیک', 'کلیکها'],
    impressions: ['impressions', 'نمایش', 'نمایشها'],
    ctr: ['ctr', 'نرختبدیلکلیک'],
    position: ['position', 'avgposition', 'جایگاه', 'موقعیت', 'میانگینجایگاه'],
  };
  const normalizedHeaders = rows[0].map(normalizeHeader);
  const indexFor = (name) => normalizedHeaders.findIndex((header) => aliases[name].map(normalizeHeader).includes(header));
  const indexes = Object.fromEntries(Object.keys(aliases).map((name) => [name, indexFor(name)]));
  if (indexes.clicks < 0 || indexes.impressions < 0 || (indexes.query < 0 && indexes.page < 0)) {
    throw new Error('ستون‌های query/page، clicks و impressions پیدا نشدند.');
  }
  return rows.slice(1).map((values) => {
    const read = (name) => indexes[name] >= 0 ? values[indexes[name]] : '';
    const impressions = Number(String(read('impressions')).replace(/[,٪%\s]/g, '')) || 0;
    const clicks = Number(String(read('clicks')).replace(/[,\s]/g, '')) || 0;
    let position = Number(String(read('position')).replace(/[,\s]/g, '')) || 0;
    if (!position && read('ctr')) position = 0;
    return {
      date: read('date') || defaultDate,
      query: read('query'),
      page: read('page'),
      clicks,
      impressions,
      position,
    };
  }).filter((row) => row.query || row.page);
}

$('#search-import-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  setMessage('#search-message', 'در حال پردازش…');
  try {
    const defaultDate = $('#search-default-date').value || isoToday();
    const rows = searchRowsFromCsv($('#search-csv').value, defaultDate);
    await api('/api/admin/analytics/search', { method: 'POST', body: JSON.stringify({ rows, defaultDate }) });
    setMessage('#search-message', `${formatNumber(rows.length)} ردیف وارد شد.`, 'ok');
    await loadDashboard();
  } catch (error) {
    setMessage('#search-message', error.message, 'error');
  }
});

$('#range-preset').addEventListener('change', (event) => {
  if (event.target.value !== 'custom') setRange(Number(event.target.value));
});
$('#range-from').addEventListener('change', () => { $('#range-preset').value = 'custom'; });
$('#range-to').addEventListener('change', () => { $('#range-preset').value = 'custom'; });
$('#refresh-dashboard').addEventListener('click', loadDashboard);

window.addEventListener('resize', () => {
  clearTimeout(chartResizeTimer);
  chartResizeTimer = setTimeout(() => {
    if (currentSummary) render(currentSummary);
  }, 150);
});

setRange(30);
$('#revenue-date').value = isoToday();
$('#search-default-date').value = isoToday();
loadDashboard();
