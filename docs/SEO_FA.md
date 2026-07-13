# راهنمای فنی SEO برای Mermaid Studio

این نسخه برای ساختن یک خوشهٔ محتوایی فارسی پیرامون Mermaid طراحی شده است؛ نه فقط یک صفحهٔ ابزار. هدف، ایندکس‌شدن صفحه‌های آموزشی مستقل، انتقال کاربر به ادیتور و اندازه‌گیری دقیق نتیجه در Search Console و داشبورد first-party است.

## تنظیمات ضروری دامنه

در `.env` مقدارهای واقعی را وارد کنید:

```dotenv
DOMAIN=diagram.example.com
SITE_URL=https://diagram.example.com
SITE_NAME=Mermaid Studio
SEO_LAST_MODIFIED=2026-07-13
GOOGLE_SITE_VERIFICATION=
BING_SITE_VERIFICATION=
SEO_AUTHOR_NAME=تیم Mermaid Studio
```

`SITE_URL` باید origin نهایی HTTPS باشد؛ بدون مسیر و بدون slash انتهایی. Canonical، Open Graph، sitemap و JSON-LD از همین مقدار ساخته می‌شوند.

## مسیرهای قابل ایندکس

- `/` صفحهٔ اصلی محصول
- `/templates` کتابخانهٔ قالب‌ها
- `/learn` مرکز آموزش
- `/learn/flowchart-mermaid`
- `/learn/sequence-diagram-mermaid`
- `/learn/er-diagram-mermaid`
- `/learn/gantt-mermaid`
- `/learn/class-diagram-mermaid`
- `/learn/mindmap-mermaid`
- `/learn/architecture-mermaid`
- `/learn/mermaid-errors`
- `/privacy`
- `/terms`

ادیتور، headless renderer، APIها و داشبورد مدیریتی `noindex` هستند و وارد sitemap نمی‌شوند.

## Canonical و جلوگیری از محتوای تکراری

نسخه‌های قدیمی مانند `/examples`، `/landing.html`، `/learn.html` و URLهای دارای slash اضافه با 301 به مسیر اصلی هدایت می‌شوند. هر صفحهٔ محتوایی یک canonical مطلق و یکتا دارد. برای دامنهٔ آزمایشی و دامنهٔ اصلی هم‌زمان محتوای قابل ایندکس منتشر نکنید.

## Sitemap و robots

پس از انتشار، این دو مسیر باید پاسخ معتبر بدهند:

```text
https://YOUR_DOMAIN/sitemap.xml
https://YOUR_DOMAIN/robots.txt
```

Sitemap شامل صفحه‌های آموزشی است و editor را حذف می‌کند. robots فقط مسیرهای API، admin و headless را مسدود می‌کند؛ صفحه‌های `noindex` باید برای خزنده قابل دریافت باشند تا meta robots دیده شود.

## دادهٔ ساختاریافته

سامانه بر اساس نوع صفحه JSON-LD مستقل تولید می‌کند:

- `WebSite` و `SoftwareApplication` برای صفحهٔ اصلی
- `CollectionPage` و `ItemList` برای قالب‌ها و آموزش
- `TechArticle` و `BreadcrumbList` برای هر درس
- `FAQPage` برای پرسش‌های واقعی هر درس

قیمت نرم‌افزار در schema صفر است و rating ساختگی وجود ندارد. پس از هر تغییر مهم، URL را با Rich Results Test و Schema Markup Validator بررسی کنید.

## عنوان و توضیحات

هر صفحه باید فقط یک هدف جست‌وجویی اصلی داشته باشد. عنوان‌ها و descriptionها در سرور تولید می‌شوند و برای مقاله‌ها یکتا هستند. از تکرار مصنوعی کلمهٔ کلیدی، مخفی‌کردن متن یا ساخت صفحه‌های کم‌محتوا خودداری کنید.

خوشهٔ فعلی این intentها را پوشش می‌دهد:

- آموزش Mermaid فارسی
- ساخت فلوچارت با کد
- آموزش Sequence Diagram
- رسم ERD با Mermaid
- نمودار گانت Mermaid
- Class Diagram و UML
- نقشه ذهنی Mermaid
- نمودار معماری Mermaid
- رفع خطاهای Mermaid

## لینک‌سازی داخلی

هر مقاله به ادیتور، صفحهٔ مادر آموزش و چند درس مرتبط لینک دارد. صفحهٔ آموزش نیز لینک HTML مستقیم به تمام مقاله‌ها دارد؛ بنابراین محتوا بدون اجرای JavaScript قابل کشف است. Anchor text باید توصیفی باشد، نه عبارت‌های عمومی مانند «اینجا کلیک کنید».

## Core Web Vitals

داشبورد first-party صدک ۷۵ دادهٔ کاربران واقعی را نگه می‌دارد. هدف اصلی:

| معیار | مقدار خوب |
|---|---:|
| LCP | حداکثر ۲.۵ ثانیه |
| INP | حداکثر ۲۰۰ میلی‌ثانیه |
| CLS | حداکثر ۰.۱ |

فایل‌های versioned با cache طولانی سرو می‌شوند و تبلیغات بعد از پایدارشدن صفحه بارگذاری می‌شوند. با این حال، اندازهٔ واقعی جایگاه تبلیغ را متناسب با فرمت پنل رزرو کنید تا لود تبلیغ باعث CLS نشود.

## اتصال Search Console

1. دامنه را ترجیحاً با روش Domain property ثبت کنید.
2. رکورد TXT تأیید را در DNS قرار دهید یا meta verification را از طریق متغیر محیطی تنظیم کنید.
3. `sitemap.xml` را ثبت کنید.
4. صفحه‌های اصلی را با URL Inspection بررسی کنید.
5. بعد از چند روز، گزارش Page indexing، Core Web Vitals و Performance را کنترل کنید.
6. CSV گزارش Performance را در داشبورد داخلی وارد کنید تا query، page، CTR و position کنار درآمد و بازدید دیده شوند.

## معیار تصمیم‌گیری محتوا

برای هر صفحه این چهار عدد را کنار هم ببینید:

- impression ارگانیک
- CTR سرچ
- ورود از صفحه به ادیتور
- درآمد واقعی یا Page RPM

نمونهٔ تصمیم:

- impression زیاد + CTR کم: عنوان و description را بهبود دهید.
- CTR خوب + ورود کم به ادیتور: CTA و مثال عملی را تقویت کنید.
- بازدید خوب + RPM پایین: جایگاه/فرمت تبلیغ را آزمایش کنید، نه اینکه تعداد بنر را بی‌حد زیاد کنید.
- position بین ۸ تا ۲۰: محتوا، مثال، لینک داخلی و پاسخ به سؤال‌های فرعی را توسعه دهید.

## پس از انتشار

```bash
curl -I https://YOUR_DOMAIN/
curl -fsS https://YOUR_DOMAIN/sitemap.xml
curl -fsS https://YOUR_DOMAIN/robots.txt
```

بررسی کنید:

- پاسخ‌ها روی HTTPS باشند.
- canonical دقیقاً دامنهٔ اصلی را نشان دهد.
- مسیرهای تکراری 301 باشند.
- editor هدر `X-Robots-Tag: noindex` داشته باشد.
- sitemap فقط URLهای 200 و canonical را شامل شود.
- هیچ دامنهٔ staging در HTML یا sitemap باقی نمانده باشد.
