const DAY_MS = 86_400_000;

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function pathname(value) {
  try {
    return new URL(value, 'https://nemodara.invalid').pathname.replace(/\/$/, '') || '/';
  } catch {
    return String(value || '/').split(/[?#]/)[0].replace(/\/$/, '') || '/';
  }
}

function daysBetween(from, to) {
  const start = new Date(`${from}T00:00:00.000Z`).getTime();
  const end = new Date(`${to}T00:00:00.000Z`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, Math.round((end - start) / DAY_MS));
}

function healthFor(item, metrics, today) {
  const ageDays = daysBetween(item.updated, today);
  const sessions = number(metrics.sessions);
  const engagement = number(metrics.avgEngagementSeconds);
  const editorRate = number(metrics.editorOpenRate);
  const impressions = number(metrics.searchImpressions);
  const position = number(metrics.searchPosition);
  const ctr = number(metrics.searchCtr);
  const reasons = [];
  let score = 100;

  if (ageDays > 365) {
    score -= 28;
    reasons.push('بیش از یک سال از بازبینی گذشته است');
  } else if (ageDays > 180) {
    score -= 14;
    reasons.push('زمان بازبینی دوباره نزدیک است');
  }
  if (sessions >= 20 && engagement < 25) {
    score -= 20;
    reasons.push('تعامل خواننده پایین است');
  }
  if (sessions >= 20 && editorRate < 2.5) {
    score -= 16;
    reasons.push('ورود به ادیتور کم است');
  }
  if (impressions >= 100 && position <= 10 && ctr < 2) {
    score -= 18;
    reasons.push('نمایش جست‌وجو خوب اما CTR پایین است');
  }
  if (number(item.wordCount) < (item.type === 'tutorial' ? 650 : 500)) {
    score -= 10;
    reasons.push('پوشش موضوع نسبتاً کوتاه است');
  }
  const normalized = Math.max(0, Math.min(100, score));
  const state = normalized < 58 ? 'critical' : normalized < 78 ? 'review' : normalized < 90 ? 'watch' : 'healthy';
  const action = state === 'critical'
    ? 'بازبینی کامل و تطبیق با قصد جست‌وجو'
    : state === 'review'
      ? reasons.some((reason) => reason.includes('CTR')) ? 'بازنویسی عنوان و توضیح نتیجه' : 'به‌روزرسانی مثال، مقدمه و لینک‌ها'
      : state === 'watch'
        ? 'پایش و اصلاح محدود'
        : 'حفظ و توسعهٔ تدریجی';
  return { score: normalized, state, reasons, action, ageDays };
}

function suggestedTitle(query, type) {
  const cleaned = String(query || '').trim();
  if (!cleaned) return type === 'update' ? 'بازبینی محتوای موجود' : 'موضوع جدید نمودارا';
  if (type === 'ctr') return `بازنویسی صفحه برای «${cleaned}»`;
  if (type === 'striking') return `راهنمای کامل ${cleaned}`;
  return `پاسخ دقیق به جست‌وجوی «${cleaned}»`;
}

function suggestedAngle(row, type) {
  if (type === 'ctr') {
    return `صفحه در نتایج دیده می‌شود اما کلیک متناسب نمی‌گیرد. Intent عبارت «${row.name}» را با عنوان، توضیح و شروع صفحه تطبیق بده؛ محتوا را صرفاً طولانی‌تر نکن.`;
  }
  if (type === 'striking') {
    return `عبارت «${row.name}» در فاصلهٔ رتبه‌گیری قرار دارد. بخش‌های ناقص، مثال عملی، پاسخ به سؤال‌های فرعی و لینک داخلی را بررسی کن.`;
  }
  return `برای «${row.name}» تقاضا دیده می‌شود اما پوشش فعلی رتبهٔ مناسبی ندارد. ابتدا بررسی کن صفحهٔ موجود باید گسترش یابد یا یک صفحهٔ مستقل لازم است.`;
}

function opportunityRows(growth) {
  const groups = [
    ['ctr', growth?.opportunities?.ctr || []],
    ['striking', growth?.opportunities?.strikingDistance || []],
    ['gap', growth?.opportunities?.contentGaps || []],
  ];
  const seen = new Set();
  const rows = [];
  for (const [type, collection] of groups) {
    for (const row of collection) {
      const key = `${type}:${String(row.name || '').trim().toLowerCase()}`;
      if (!row.name || seen.has(key)) continue;
      seen.add(key);
      rows.push({
        id: key,
        type,
        query: row.name,
        impressions: number(row.impressions),
        clicks: number(row.clicks),
        ctr: number(row.ctr),
        position: number(row.position),
        potentialClicks: number(row.missingClicks),
        suggestedTitle: suggestedTitle(row.name, type),
        suggestedContentType: type === 'ctr' ? 'update' : 'article',
        suggestedAngle: suggestedAngle(row, type),
      });
    }
  }
  return rows.sort((a, b) => (b.potentialClicks - a.potentialClicks) || (b.impressions - a.impressions)).slice(0, 100);
}

function briefIsActive(brief) {
  return !['published', 'archived'].includes(brief.status);
}

export function buildContentOperations({ inventory = [], growth = {}, briefs = [], today = new Date().toISOString().slice(0, 10) }) {
  const matrix = new Map((growth.contentMatrix || []).map((row) => [pathname(row.path), row]));
  const enriched = inventory.map((item) => {
    const metrics = matrix.get(pathname(item.path)) || {};
    const health = healthFor(item, metrics, today);
    return {
      ...item,
      pageviews: number(metrics.pageviews),
      sessions: number(metrics.sessions),
      avgEngagementSeconds: number(metrics.avgEngagementSeconds),
      editorOpens: number(metrics.editorOpens),
      editorOpenRate: number(metrics.editorOpenRate),
      searchClicks: number(metrics.searchClicks),
      searchImpressions: number(metrics.searchImpressions),
      searchCtr: number(metrics.searchCtr),
      searchPosition: number(metrics.searchPosition),
      health,
    };
  }).sort((a, b) => a.health.score - b.health.score || b.pageviews - a.pageviews);

  const opportunities = opportunityRows(growth);
  const dueThreshold = new Date(`${today}T00:00:00.000Z`);
  dueThreshold.setUTCDate(dueThreshold.getUTCDate() + 7);
  const dueLimit = dueThreshold.toISOString().slice(0, 10);
  const activeBriefs = briefs.filter(briefIsActive);
  const calendar = activeBriefs
    .filter((brief) => brief.dueDate)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.priority - b.priority)
    .slice(0, 30);

  return {
    generatedAt: new Date().toISOString(),
    range: { from: growth.current?.from || '', to: growth.current?.to || '' },
    metrics: {
      totalContent: enriched.length,
      staleContent: enriched.filter((item) => ['critical', 'review'].includes(item.health.state)).length,
      activeBriefs: activeBriefs.length,
      dueBriefs: activeBriefs.filter((brief) => brief.dueDate && brief.dueDate <= dueLimit).length,
      opportunities: opportunities.length,
      potentialClicks: opportunities.reduce((sum, row) => sum + row.potentialClicks, 0),
    },
    inventory: enriched,
    briefs: briefs.slice().sort((a, b) => a.priority - b.priority || (a.dueDate || '9999').localeCompare(b.dueDate || '9999')),
    owners: [...new Set(briefs.map((brief) => brief.owner).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fa')),
    calendar,
    opportunities,
  };
}

export { pathname };
