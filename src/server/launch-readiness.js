function booleanValue(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function cleanOrigin(value) {
  try {
    const url = new URL(String(value || '').trim());
    if (url.protocol !== 'https:') return '';
    return url.origin;
  } catch {
    return '';
  }
}

function check(key, label, status, weight, detail, action) {
  return { key, label, status, weight, detail, action };
}

function scoreChecks(checks) {
  const total = checks.reduce((sum, item) => sum + item.weight, 0);
  const earned = checks.reduce((sum, item) => {
    if (item.status === 'pass') return sum + item.weight;
    if (item.status === 'warning') return sum + item.weight * 0.45;
    return sum;
  }, 0);
  return total ? Math.round((earned / total) * 100) : 0;
}

export function buildLaunchReadiness({ environment = process.env, seo, analytics, advertising, integrations = {} }) {
  const siteOrigin = cleanOrigin(seo?.siteUrl || environment.SITE_URL);
  const expectedOrigin = 'https://nemodara.ir';
  const editorOrigin = cleanOrigin(advertising?.editor?.frameOrigin);
  const contentSlots = Object.entries(advertising?.slots || {})
    .filter(([name, value]) => value && !name.startsWith('editor'))
    .map(([name]) => name);
  const editorSlots = Object.entries(advertising?.slots || {})
    .filter(([name, value]) => value && name.startsWith('editor'))
    .map(([name]) => name);

  const checks = [
    check(
      'canonical-origin',
      'دامنهٔ canonical روی HTTPS',
      siteOrigin === expectedOrigin ? 'pass' : siteOrigin ? 'warning' : 'blocker',
      12,
      siteOrigin ? `Origin فعلی: ${siteOrigin}` : 'SITE_URL معتبر و HTTPS تنظیم نشده است.',
      siteOrigin ? 'اگر این محیط Production است، SITE_URL را دقیقاً روی https://nemodara.ir قرار دهید.' : 'SITE_URL را قبل از انتشار تنظیم کنید.',
    ),
    check(
      'trusted-proxy',
      'اعتماد به reverse proxy',
      booleanValue(environment.TRUST_PROXY) ? 'pass' : 'warning',
      4,
      booleanValue(environment.TRUST_PROXY) ? 'TRUST_PROXY فعال است.' : 'پروتکل و IP پشت Ingress ممکن است درست تشخیص داده نشوند.',
      'در دارکوب و سایر Ingressهای مورد اعتماد، TRUST_PROXY=true باشد.',
    ),
    check(
      'analytics-enabled',
      'آنالیتیکس first-party فعال است',
      analytics?.enabled ? 'pass' : 'blocker',
      8,
      analytics?.enabled ? 'ثبت تجمیعی بازدید و قیف فعال است.' : 'دادهٔ واقعی برای تصمیم درآمدی جمع نمی‌شود.',
      'ANALYTICS_ENABLED=true را تنظیم کنید.',
    ),
    check(
      'admin-auth',
      'رمز پنل ادمین امن است',
      analytics?.adminConfigured ? 'pass' : 'blocker',
      10,
      analytics?.adminConfigured ? 'Basic Auth پنل با رمز معتبر پیکربندی شده است.' : 'پنل یا در دسترس نیست یا رمز امن ندارد.',
      'یک رمز تصادفی حداقل ۳۲ کاراکتری برای ANALYTICS_ADMIN_PASSWORD بسازید.',
    ),
    check(
      'analytics-secret',
      'HMAC Secret پایدار است',
      analytics?.persistentHashSecret ? 'pass' : 'blocker',
      8,
      analytics?.persistentHashSecret ? 'شناسه‌های روزانه پس از restart پایدار می‌مانند.' : 'Secret موقت پس از restart تغییر می‌کند.',
      'ANALYTICS_HASH_SECRET را با openssl rand -hex 32 تولید و در Secretهای میزبان ذخیره کنید.',
    ),
    check(
      'analytics-storage',
      'ذخیره‌سازی آنالیتیکس سالم است',
      analytics?.lastError ? 'blocker' : 'pass',
      10,
      analytics?.lastError || 'خطای نوشتن یا خواندن گزارش نشده است.',
      'دسترسی نوشتن روی /data/analytics و سلامت دیسک دائمی را بررسی کنید.',
    ),
    check(
      'content-ad-inventory',
      'موجودی تبلیغ صفحات محتوایی',
      advertising?.enabled && contentSlots.length >= 3 ? 'pass' : advertising?.enabled && contentSlots.length ? 'warning' : 'warning',
      8,
      advertising?.enabled ? `${contentSlots.length} جایگاه محتوایی پیکربندی شده است.` : 'شبکهٔ تبلیغاتی هنوز فعال نیست.',
      'بعد از تأیید ناشر، حداقل جایگاه‌های خانه، آموزش و مقاله را با شناسه‌های واقعی پنل پر کنید.',
    ),
    check(
      'editor-ad-inventory',
      'موجودی تبلیغ ادیتور',
      advertising?.editor?.enabled && editorSlots.length >= 2 ? 'pass' : advertising?.editor?.requested ? 'blocker' : 'warning',
      12,
      advertising?.editor?.enabled ? `${editorSlots.length} جایگاه ادیتور با ایزولاسیون فعال است.` : advertising?.editor?.requested ? 'درخواست فعال‌سازی وجود دارد اما شرط‌های ایزولاسیون یا شناسه‌ها کامل نیستند.' : 'تبلیغ ادیتور هنوز فعال نشده است.',
      'ADS_EDITOR_ENABLED، Origin جداگانه و شناسه‌های editorRail/editorDock را تنظیم کنید.',
    ),
    check(
      'editor-ad-isolation',
      'تبلیغ ادیتور از DOM کد جداست',
      advertising?.editor?.enabled && editorOrigin && editorOrigin !== siteOrigin ? 'pass' : advertising?.editor?.requested ? 'blocker' : 'warning',
      14,
      editorOrigin ? `Frame origin: ${editorOrigin}` : 'Origin جداگانه برای iframe تبلیغ تعریف نشده است.',
      'ads.nemodara.ir را به همان App متصل و ADS_EDITOR_FRAME_ORIGIN=https://ads.nemodara.ir تنظیم کنید.',
    ),
    check(
      'search-console',
      'اتصال Search Console',
      integrations?.searchConsole?.configured ? 'pass' : 'warning',
      8,
      integrations?.searchConsole?.configured ? 'همگام‌سازی مستقیم آماده است.' : 'دادهٔ Query و Position فقط با CSV قابل ورود است.',
      'Service Account خواندنی را به Property sc-domain:nemodara.ir اضافه کنید.',
    ),
    check(
      'google-verification',
      'تأیید مالکیت گوگل',
      seo?.googleVerification ? 'pass' : 'warning',
      5,
      seo?.googleVerification ? 'Meta verification در HTML تولید می‌شود.' : 'توکن GOOGLE_SITE_VERIFICATION ثبت نشده است.',
      'Domain Property را در Search Console تأیید و توکن را تنظیم کنید.',
    ),
    check(
      'indexnow',
      'IndexNow',
      integrations?.indexNow?.configured ? 'pass' : 'warning',
      3,
      integrations?.indexNow?.configured ? 'ارسال URLهای canonical آماده است.' : 'اطلاع‌رسانی سریع تغییر URLها غیرفعال است.',
      'در صورت نیاز INDEXNOW_KEY را ایجاد و اتصال را فعال کنید.',
    ),
  ];

  const score = scoreChecks(checks);
  const blockers = checks.filter((item) => item.status === 'blocker');
  const warnings = checks.filter((item) => item.status === 'warning');
  return {
    generatedAt: new Date().toISOString(),
    score,
    grade: score >= 92 ? 'A' : score >= 82 ? 'B' : score >= 70 ? 'C' : score >= 55 ? 'D' : 'F',
    ready: blockers.length === 0,
    monetizationReady: Boolean(advertising?.enabled && advertising?.editor?.enabled && contentSlots.length),
    checks,
    counts: { blockers: blockers.length, warnings: warnings.length, passed: checks.filter((item) => item.status === 'pass').length },
    summary: blockers.length
      ? 'پیش از انتشار رسمی، موارد مسدودکننده را برطرف کنید.'
      : warnings.length
        ? 'انتشار ممکن است، اما چند مورد درآمدی یا SEO هنوز کامل نیست.'
        : 'پیکربندی اصلی برای انتشار و اندازه‌گیری درآمد آماده است.',
  };
}
