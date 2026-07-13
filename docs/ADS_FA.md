# راه‌اندازی درآمد تبلیغاتی ایرانی در Mermaid Studio

Mermaid Studio قرار است برای همهٔ کاربران رایگان بماند. در این نسخه، درآمدزایی فقط از جایگاه‌های تبلیغاتی صفحات محتوایی انجام می‌شود؛ ادیتور کد عمداً تبلیغ شخص ثالث ندارد تا اسکریپت شبکهٔ تبلیغاتی به محتوای نمودار کاربر دسترسی پیدا نکند.

## جایگاه‌های آماده

| متغیر محیطی | محل نمایش |
|---|---|
| `ADS_SLOT_HOME_TOP` | صفحهٔ اصلی، پس از معرفی اولیه |
| `ADS_SLOT_HOME_INLINE` | صفحهٔ اصلی، میان بخش‌های محتوایی |
| `ADS_SLOT_TEMPLATES_TOP` | ابتدای کتابخانهٔ قالب‌ها |
| `ADS_SLOT_TEMPLATES_INLINE` | بعد از فهرست قالب‌ها |
| `ADS_SLOT_LEARN_TOP` | ابتدای مرکز آموزش |
| `ADS_SLOT_LEARN_INLINE` | بعد از محتوای آموزشی |

هر جایگاه خالی باشد، هیچ فضای خالی یا درخواست تبلیغاتی برای آن ساخته نمی‌شود.

## اتصال یکتانت

1. در پنل ناشران یکتانت، سایت را ثبت و تأیید کنید.
2. برای صفحهٔ اصلی، قالب‌ها و آموزش‌ها جایگاه‌های جدا بسازید تا گزارش درآمد هر بخش مستقل باشد.
3. از کدی که پنل می‌دهد، URL فایل JavaScript سراسری، شناسهٔ خود تگ `script` و شناسهٔ `div` هر جایگاه را بردارید.
4. مقادیر را در `.env` وارد کنید:

```dotenv
ADS_ENABLED=true
ADS_PROVIDER=yektanet
ADS_SCRIPT_URL=https://cdn.yektanet.com/.../rg.complete.js
ADS_SCRIPT_ID=ua-script-XXXXXXXX
ADS_ALLOWED_ORIGINS=https://cdn.yektanet.com,https://*.yektanet.com
ADS_LOAD_DELAY_MS=700

ADS_SLOT_HOME_TOP=pos-article-display-card-111111
ADS_SLOT_HOME_INLINE=pos-article-display-card-222222
ADS_SLOT_TEMPLATES_TOP=pos-article-display-card-333333
ADS_SLOT_TEMPLATES_INLINE=pos-article-display-card-444444
ADS_SLOT_LEARN_TOP=pos-article-display-card-555555
ADS_SLOT_LEARN_INLINE=pos-article-display-card-666666
```

مقادیر بالا نمونه‌اند. URL و شناسه‌ها را دقیقاً از پنل خودتان جایگزین کنید.

## اتصال تپسل

برای تپسل نیز `ADS_PROVIDER=tapsell` را انتخاب و URL اسکریپت و شناسهٔ جایگاه‌هایی را که پنل ناشران وب ارائه می‌کند وارد کنید:

```dotenv
ADS_ENABLED=true
ADS_PROVIDER=tapsell
ADS_SCRIPT_URL=https://example-cdn-from-panel/script.js
ADS_SCRIPT_ID=tapsell-publisher-script
ADS_ALLOWED_ORIGINS=https://example-cdn-from-panel,https://*.example-ad-domain.ir
ADS_SLOT_HOME_TOP=placement-id-from-panel
ADS_SLOT_TEMPLATES_INLINE=placement-id-from-panel
ADS_SLOT_LEARN_INLINE=placement-id-from-panel
```

اگر قطعه‌کد پنل تپسل علاوه بر اسکریپت و یک `div`، تابع راه‌اندازی اختصاصی هم داشت، همان قطعه‌کد را مبنای نهایی قرار دهید و adapter فایل `public/js/ads.js` را مطابق مستندات پنل تکمیل کنید. هیچ کد یا شناسهٔ حدسی را در محیط production قرار ندهید.

## ترتیب پیشنهادی شروع

در هفتهٔ اول فقط این سه جایگاه را فعال کنید:

```dotenv
ADS_SLOT_HOME_INLINE=...
ADS_SLOT_TEMPLATES_INLINE=...
ADS_SLOT_LEARN_INLINE=...
```

سپس با آمار واقعی پنل، نرخ نمایش، کلیک، درآمد و افت سرعت را مقایسه کنید. اگر تجربهٔ کاربر مناسب بود، جایگاه‌های بالای صفحات را نیز فعال کنید. بیشتر کردن تعداد بنرها لزوماً درآمد را بیشتر نمی‌کند و ممکن است نرخ بازگشت کاربر را کاهش دهد.

## امنیت و Content Security Policy

Mermaid Studio به‌طور پیش‌فرض فقط منابع همان دامنه را می‌پذیرد. هنگام فعال‌کردن تبلیغات، دامنه‌هایی که پنل شبکه واقعاً استفاده می‌کند باید در `ADS_ALLOWED_ORIGINS` قرار بگیرند. چند دامنه را با ویرگول جدا کنید. فقط آدرس‌های HTTPS پذیرفته می‌شوند.

بعد از انتشار، Console مرورگر را بررسی کنید. اگر منبع معتبری با خطای CSP مسدود شد، فقط همان origin را اضافه کنید؛ از مقادیر بسیار باز مانند `https:` یا `*` استفاده نکنید.

## اصول تجربهٔ کاربر و سیاست شبکه‌ها

- روی تبلیغ عبارت «تبلیغات» نمایش داده می‌شود.
- تبلیغ پاپ‌آپ، تمام‌صفحه یا چسبان روی دکمه‌های دانلود استفاده نکنید.
- از کاربر نخواهید روی تبلیغ کلیک کند و خودتان نیز برای تست روی تبلیغات زنده کلیک نکنید.
- جایگاه را کنار دکمه‌های «دانلود»، «کپی» یا «ورود به ادیتور» نگذارید تا کلیک اشتباهی ایجاد نشود.
- آمار تبلیغ را با درآمد واقعی به‌ازای هزار بازدید صفحه مقایسه کنید، نه فقط تعداد کلیک.
- کد Mermaid، محتوای ادیتور یا لینک اشتراک‌گذاری را به شبکهٔ تبلیغاتی ارسال نکنید.

## خاموش‌کردن فوری تبلیغات

بدون تغییر کد می‌توان همهٔ تبلیغات را خاموش کرد:

```dotenv
ADS_ENABLED=false
```

پس از راه‌اندازی مجدد برنامه، endpoint تنظیمات تبلیغاتی حالت غیرفعال برمی‌گرداند و مرورگر هیچ اسکریپت شخص ثالثی بارگذاری نمی‌کند.
