const $ = (selector) => document.querySelector(selector);
const fa = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 1 });
const rial = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 0 });

function formatRial(value) {
  const number = Number(value) || 0;
  if (Math.abs(number) >= 1_000_000_000) return `${fa.format(number / 1_000_000_000)} میلیارد ریال`;
  if (Math.abs(number) >= 1_000_000) return `${fa.format(number / 1_000_000)} میلیون ریال`;
  return `${rial.format(number)} ریال`;
}

function calculate() {
  const pageviews = Math.max(0, Number($('#planner-pageviews')?.value) || 0);
  const rpm = Math.max(0, Number($('#planner-rpm')?.value) || 0);
  const growth = Math.max(-90, Math.min(500, Number($('#planner-growth')?.value) || 0));
  const fill = Math.max(0, Math.min(100, Number($('#planner-fill')?.value) || 0));
  const viewability = Math.max(0, Math.min(100, Number($('#planner-viewability')?.value) || 0));
  const projectedViews = pageviews * (1 + growth / 100);
  const qualityFactor = (fill / 100) * (viewability / 100);
  const base = projectedViews / 1000 * rpm * qualityFactor;
  const conservative = base * 0.7;
  const optimistic = base * 1.28;
  $('#planner-projected-views').textContent = fa.format(Math.round(projectedViews));
  $('#planner-conservative').textContent = formatRial(conservative);
  $('#planner-base').textContent = formatRial(base);
  $('#planner-optimistic').textContent = formatRial(optimistic);
  $('#planner-note').textContent = `مدل بر اساس Page RPM، نرخ پرشدن و Viewability است؛ عدد پنل ناشر معیار نهایی باقی می‌ماند.`;
}

async function initialize() {
  const form = $('#revenue-planner-form');
  if (!form) return;
  try {
    const response = await fetch('/api/admin/analytics/summary?days=30', { credentials: 'same-origin', cache: 'no-store' });
    if (response.ok) {
      const summary = await response.json();
      $('#planner-pageviews').value = Math.max(0, Math.round(Number(summary.totals?.pageviews) || 0));
      $('#planner-rpm').value = Math.max(0, Math.round(Number(summary.rates?.pageRpmRial) || Number(summary.forecast?.estimatedRpmRial) || 0));
      $('#planner-fill').value = Math.round(Number(summary.rates?.fillRate) || 70);
    }
  } catch {
    // The planner remains usable with manual values.
  }
  form.addEventListener('input', calculate);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    calculate();
  });
  calculate();
}

initialize();
