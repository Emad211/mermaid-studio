const DAY_MS = 86_400_000;

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function percentChange(current, previous) {
  const a = number(current);
  const b = number(previous);
  if (!b) return a ? 100 : 0;
  return ((a - b) / Math.abs(b)) * 100;
}

function addDays(day, amount) {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function previousRange(summary) {
  const from = new Date(`${summary.from}T00:00:00.000Z`);
  const to = new Date(`${summary.to}T00:00:00.000Z`);
  const days = Math.max(1, Math.round((to - from) / DAY_MS) + 1);
  const previousTo = addDays(summary.from, -1);
  return { from: addDays(previousTo, -(days - 1)), to: previousTo, days };
}

function metric(current, previous, direction = 'up') {
  const delta = percentChange(current, previous);
  const improved = direction === 'down' ? delta <= 0 : delta >= 0;
  return { current: number(current), previous: number(previous), delta, improved };
}

function expectedCtr(position) {
  const value = number(position);
  if (value <= 1) return 28;
  if (value <= 2) return 16;
  if (value <= 3) return 11;
  if (value <= 4) return 8;
  if (value <= 5) return 6;
  if (value <= 7) return 4;
  if (value <= 10) return 2.8;
  if (value <= 20) return 1.3;
  return 0.6;
}

function pathname(value) {
  try {
    return new URL(value, 'https://growth.invalid').pathname.replace(/\/$/, '') || '/';
  } catch {
    return String(value || '/').split('?')[0].replace(/\/$/, '') || '/';
  }
}

function searchOpportunities(summary) {
  const queries = summary.search?.topQueries || [];
  const ctr = [];
  const striking = [];
  const gaps = [];
  for (const row of queries) {
    const impressions = number(row.impressions);
    const position = number(row.position);
    const actualCtr = number(row.ctr);
    const benchmark = expectedCtr(position);
    const missingClicks = Math.max(0, Math.round((benchmark / 100) * impressions - number(row.clicks)));
    const item = { ...row, expectedCtr: benchmark, missingClicks };
    if (impressions >= 50 && position <= 10 && actualCtr + 0.5 < benchmark) ctr.push(item);
    if (impressions >= 30 && position > 3 && position <= 20) striking.push(item);
    if (impressions >= 100 && position > 20) gaps.push(item);
  }
  return {
    ctr: ctr.sort((a, b) => b.missingClicks - a.missingClicks).slice(0, 20),
    strikingDistance: striking.sort((a, b) => b.impressions - a.impressions).slice(0, 20),
    contentGaps: gaps.sort((a, b) => b.impressions - a.impressions).slice(0, 20),
  };
}

function contentMatrix(summary) {
  const searchPages = new Map((summary.search?.topPages || []).map((row) => [pathname(row.name), row]));
  return (summary.topPages || []).map((page) => {
    const search = searchPages.get(pathname(page.name)) || {};
    const sessions = number(page.sessions);
    const editorOpens = number(page.editorOpens);
    return {
      path: pathname(page.name),
      pageviews: number(page.pageviews),
      sessions,
      engagementSeconds: number(page.engagementSeconds),
      avgEngagementSeconds: sessions ? number(page.engagementSeconds) / sessions : 0,
      editorOpens,
      editorOpenRate: sessions ? (editorOpens / sessions) * 100 : 0,
      searchClicks: number(search.clicks),
      searchImpressions: number(search.impressions),
      searchCtr: number(search.ctr),
      searchPosition: number(search.position),
    };
  }).sort((a, b) => b.pageviews - a.pageviews);
}

function funnel(summary) {
  const totals = summary.totals || {};
  const events = summary.events || {};
  const sessions = number(totals.sessions);
  const editor = number(totals.editorSessions || events.editor_open);
  const renders = number(totals.renderSessions || events.render_success);
  const exports = number(totals.exportSessions || totals.exports);
  const shares = number(totals.shareSessions || events.share);
  const steps = [
    { key: 'sessions', label: 'جلسه', value: sessions },
    { key: 'editor', label: 'ورود به ادیتور', value: editor },
    { key: 'render', label: 'رندر موفق', value: renders },
    { key: 'export', label: 'دریافت خروجی', value: exports },
    { key: 'share', label: 'اشتراک‌گذاری', value: shares },
  ];
  return steps.map((step, index) => ({
    ...step,
    previousValue: index ? steps[index - 1].value : sessions,
    stepRate: index && steps[index - 1].value ? Math.min(100, (step.value / steps[index - 1].value) * 100) : 100,
    overallRate: sessions ? Math.min(100, (step.value / sessions) * 100) : 0,
  }));
}

function goalProgress(goals, current) {
  const rows = [
    ['monthlyRevenueRial', 'درآمد ماهانه', current.totals?.actualRevenueRial, goals.monthlyRevenueRial, 'rial'],
    ['monthlyPageviews', 'بازدید ماهانه', current.totals?.pageviews, goals.monthlyPageviews, 'number'],
    ['monthlyOrganicClicks', 'کلیک ارگانیک', current.totals?.searchClicks, goals.monthlyOrganicClicks, 'number'],
    ['editorOpenRate', 'نرخ ورود به ادیتور', current.rates?.editorOpenRate, goals.editorOpenRate, 'percent'],
    ['pageRpmRial', 'RPM صفحه', current.rates?.pageRpmRial, goals.pageRpmRial, 'rial'],
  ];
  return rows.map(([key, label, value, target, unit]) => ({
    key,
    label,
    value: number(value),
    target: number(target),
    unit,
    progress: number(target) ? Math.min(150, (number(value) / number(target)) * 100) : 0,
    configured: number(target) > 0,
  }));
}

function makeAlert(severity, category, title, detail, action, view = 'overview') {
  return { id: `${category}-${title}`.toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g, '-'), severity, category, title, detail, action, view };
}

function alerts({ current, previous, audit, configuration }) {
  const result = [];
  const trafficDelta = percentChange(current.totals?.pageviews, previous.totals?.pageviews);
  const revenueDelta = percentChange(current.totals?.actualRevenueRial, previous.totals?.actualRevenueRial);
  const searchDelta = percentChange(current.totals?.searchClicks, previous.totals?.searchClicks);
  const rpmDelta = percentChange(current.rates?.pageRpmRial, previous.rates?.pageRpmRial);
  const renderRate = number(current.rates?.renderSuccessRate);
  const fillRate = number(current.rates?.fillRate);
  const adViews = number(current.totals?.adSlotViews);
  const blocked = (current.adSlots || []).reduce((sum, row) => sum + number(row.blocked), 0);

  if (trafficDelta <= -25 && number(previous.totals?.pageviews) >= 20) {
    result.push(makeAlert('critical', 'traffic', 'افت جدی بازدید', `بازدید نسبت به بازهٔ قبل ${Math.abs(trafficDelta).toFixed(1)}٪ کاهش یافته است.`, 'منابع ورودی، صفحات افت‌کرده و تغییرات ثبت‌شده را بررسی کنید.'));
  } else if (trafficDelta <= -12 && number(previous.totals?.pageviews) >= 20) {
    result.push(makeAlert('warning', 'traffic', 'کاهش بازدید', `بازدید نسبت به بازهٔ قبل ${Math.abs(trafficDelta).toFixed(1)}٪ کمتر است.`, 'روند روزانه و Search Console را مقایسه کنید.'));
  }

  if (number(current.totals?.actualRevenueRial) > 0 && revenueDelta <= -20) {
    result.push(makeAlert('critical', 'revenue', 'افت درآمد تبلیغات', `درآمد واقعی ${Math.abs(revenueDelta).toFixed(1)}٪ کاهش یافته است.`, 'RPM، fill rate و عملکرد هر جایگاه را مقایسه کنید.', 'revenue'));
  }
  if (number(current.totals?.actualRevenueRial) > 0 && rpmDelta <= -15) {
    result.push(makeAlert('warning', 'revenue', 'کاهش RPM صفحه', `RPM صفحه ${Math.abs(rpmDelta).toFixed(1)}٪ افت کرده است.`, 'ترکیب کشور/دستگاه، جایگاه و کیفیت ترافیک را بررسی کنید.', 'revenue'));
  }
  if (adViews > 100 && fillRate < 45) {
    result.push(makeAlert('warning', 'advertising', 'Fill rate پایین', `نسبت impression پنل به جایگاه‌های دیده‌شده حدود ${fillRate.toFixed(1)}٪ است.`, 'تنظیم جایگاه، ad blocker و موجودی شبکه را بررسی کنید.', 'revenue'));
  }
  if (adViews > 50 && blocked / adViews > 0.25) {
    result.push(makeAlert('info', 'advertising', 'نرخ بالای مسدودشدن تبلیغ', `${((blocked / adViews) * 100).toFixed(1)}٪ از مشاهده‌های جایگاه با مسدودشدن ثبت شده‌اند.`, 'درآمد را بر مبنای کاربران بدون ad blocker پیش‌بینی کنید.', 'revenue'));
  }

  if (searchDelta <= -20 && number(previous.totals?.searchClicks) >= 10) {
    result.push(makeAlert('critical', 'seo', 'افت کلیک ارگانیک', `کلیک ارگانیک ${Math.abs(searchDelta).toFixed(1)}٪ کاهش یافته است.`, 'Queryها، صفحه‌ها، وضعیت ایندکس و تغییرات الگوریتمی را بررسی کنید.', 'seo'));
  }
  if (renderRate && renderRate < 92) {
    result.push(makeAlert(renderRate < 80 ? 'critical' : 'warning', 'product', 'خطای زیاد در رندر', `نرخ موفقیت رندر ${renderRate.toFixed(1)}٪ است.`, 'نمونه خطاها و مرورگرهای درگیر را بررسی کنید.', 'performance'));
  }

  for (const [key, label] of [['lcp', 'LCP'], ['inp', 'INP'], ['cls', 'CLS']]) {
    const value = current.vitals?.[key];
    if (value?.good === false) {
      result.push(makeAlert('warning', 'performance', `${label} نیاز به بهبود دارد`, `صدک ۷۵ ${label} برابر ${value.p75} ${value.unit === 'score' ? '' : 'ms'} است.`, 'صفحات و دستگاه‌های کند را اولویت‌بندی کنید.', 'performance'));
    }
  }

  if (audit && audit.score < 80) {
    result.push(makeAlert(audit.score < 60 ? 'critical' : 'warning', 'seo', 'امتیاز فنی SEO پایین است', `آخرین ممیزی امتیاز ${audit.score} از ۱۰۰ را ثبت کرده است.`, 'خطاهای critical و سپس warning را برطرف کنید.', 'audit'));
  }
  if (!configuration?.siteUrl) {
    result.push(makeAlert('critical', 'configuration', 'SITE_URL تنظیم نشده است', 'Canonical، sitemap و دادهٔ ساختاریافته بدون دامنهٔ اصلی قابل اتکا نیستند.', 'SITE_URL را روی origin نهایی HTTPS قرار دهید.', 'settings'));
  }
  if (!configuration?.googleVerification) {
    result.push(makeAlert('info', 'seo', 'تأیید Search Console ثبت نشده', 'Meta verification گوگل در تنظیمات وجود ندارد.', 'Domain property را در Search Console تأیید کنید.', 'seo'));
  }
  if (!number(current.totals?.actualRevenueRial) && number(current.totals?.pageviews) >= 100) {
    result.push(makeAlert('info', 'revenue', 'درآمد واقعی وارد نشده است', 'بازدید ثبت شده اما رکورد درآمدی برای این بازه وجود ندارد.', 'گزارش پنل ناشر را وارد کنید تا RPM و پیش‌بینی واقعی شوند.', 'revenue'));
  }

  const order = { critical: 0, warning: 1, info: 2, success: 3 };
  return result.sort((a, b) => order[a.severity] - order[b.severity]).slice(0, 40);
}

export function buildGrowthReport({ current, previous, audit = null, goals = {}, annotations = [], configuration = {} }) {
  const comparison = {
    pageviews: metric(current.totals?.pageviews, previous.totals?.pageviews),
    sessions: metric(current.totals?.sessions, previous.totals?.sessions),
    visitors: metric(current.totals?.visitors, previous.totals?.visitors),
    revenueRial: metric(current.totals?.actualRevenueRial, previous.totals?.actualRevenueRial),
    pageRpmRial: metric(current.rates?.pageRpmRial, previous.rates?.pageRpmRial),
    searchClicks: metric(current.totals?.searchClicks, previous.totals?.searchClicks),
    searchImpressions: metric(current.totals?.searchImpressions, previous.totals?.searchImpressions),
    exports: metric(current.totals?.exports, previous.totals?.exports),
    editorOpenRate: metric(current.rates?.editorOpenRate, previous.rates?.editorOpenRate),
    bounceRate: metric(current.rates?.bounceRate, previous.rates?.bounceRate, 'down'),
  };
  const opportunities = searchOpportunities(current);
  const matrix = contentMatrix(current);
  return {
    generatedAt: new Date().toISOString(),
    current,
    previous: { from: previous.from, to: previous.to, totals: previous.totals, rates: previous.rates },
    comparison,
    funnel: funnel(current),
    goals: goalProgress(goals, current),
    annotations,
    contentMatrix: matrix,
    opportunities,
    alerts: alerts({ current, previous, audit, configuration }),
    executive: {
      seoScore: audit?.score ?? null,
      activeAlerts: alerts({ current, previous, audit, configuration }).length,
      opportunityClicks: opportunities.ctr.reduce((sum, row) => sum + number(row.missingClicks), 0),
      contentPages: matrix.length,
    },
  };
}

export { expectedCtr, percentChange };
