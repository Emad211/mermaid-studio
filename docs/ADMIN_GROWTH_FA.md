# راهنمای مرکز کنترل رشد، درآمد و SEO

مسیر مدیریتی Mermaid Studio:

```text
https://YOUR_DOMAIN/admin/analytics
```

این پنل با HTTP Basic Auth محافظت می‌شود، `noindex` است و در sitemap قرار نمی‌گیرد. تمام درخواست‌های تغییردهنده علاوه بر احراز هویت، کنترل Same-Origin دارند.

## بخش‌های پنل

### نمای کلی مدیریتی

- Pageview، Session و کاربر یکتای روزانه
- درآمد واقعی، Page RPM و پیش‌بینی ۳۰روزه
- مقایسهٔ خودکار با بازهٔ قبلی هم‌اندازه
- هشدارهای افت ترافیک، درآمد، RPM، کلیک ارگانیک، Fill Rate، رندر و Web Vitals
- قیف Session → Editor → Render → Export → Share
- پیشرفت هدف‌های درآمد، ترافیک، کلیک ارگانیک و نرخ ورود به ادیتور
- Annotation رویدادهای انتشار، کمپین، محتوا، تغییر فنی و تبلیغات

### درآمد و تبلیغات

- درآمد، Impression و Click واقعی هر شبکه و جایگاه
- Page RPM، Session RPM، eCPM، CPC، CTR و Fill Rate تقریبی
- روند روزانهٔ درآمد، Impression و Click
- مقایسهٔ یکتانت، تپسل و سایر منابع
- سلامت هر جایگاه: دیده‌شدن، بارگذاری، خطا و مسدودشدن

درآمد معتبر باید از گزارش پنل ناشر وارد شود. رخدادهای سمت سایت فقط مشاهدهٔ جایگاه و وضعیت اسکریپت را ثبت می‌کنند و معادل Impression قابل‌پرداخت نیستند.

### رشد ارگانیک و Search Console

- Click، Impression، CTR و Average Position
- Queryهای دارای رتبهٔ مناسب اما CTR پایین
- عبارت‌های «فاصله تا صفحهٔ اول» در رتبه‌های تقریبی ۴ تا ۲۰
- شکاف‌های محتوایی با تقاضای بالا و رتبهٔ ضعیف
- ماتریس صفحه شامل ترافیک، تعامل، نرخ ورود به ادیتور و دادهٔ جست‌وجو
- ورود دستی CSV یا همگام‌سازی اختیاری API

### ممیزی فنی SEO

ممیزی، صفحه‌های واقعی همان deployment را دریافت می‌کند و برای هر URL این موارد را کنترل می‌کند:

- HTTP status و زمان پاسخ
- Canonical مطلق و یکتا
- Indexability و meta/X-Robots-Tag
- Title، description، H1 و زبان سند
- محتوای متنی و لینک داخلی
- JSON-LD معتبر و هماهنگ با صفحه
- Open Graph و Twitter Card
- Alt تصاویر
- حضور URL canonical در sitemap
- حجم HTML

همچنین sitemap، robots.txt، مسیرهای noindex و Redirectهای legacy بررسی می‌شوند. امتیاز ممیزی یک شاخص داخلی برای جلوگیری از regression است، نه تضمین رتبه در موتور جست‌وجو.

### تجربهٔ محصول و Web Vitals

- LCP، INP و CLS در صدک ۷۵
- TTFB و FCP به‌عنوان شاخص تشخیصی
- نرخ پرش تقریبی، زمان تعامل و نرخ موفقیت رندر
- خروجی‌ها به تفکیک فرمت
- کانال، Referrer، دستگاه، مرورگر و سیستم‌عامل

## تنظیم هدف‌ها

هدف‌ها روی volume آنالیتیکس ذخیره می‌شوند:

```text
درآمد ماهانه
بازدید ماهانه
کلیک ارگانیک ماهانه
نرخ ورود به ادیتور
Page RPM
LCP / INP / CLS
```

هدف صفر یعنی آن هدف هنوز تنظیم نشده است.

## Annotationها

هر تغییر مهم را ثبت کنید تا علت جهش یا افت نمودارها مشخص باشد:

- انتشار نسخه
- کمپین یا معرفی در شبکه اجتماعی
- تغییر Title یا محتوای مقاله
- تغییر جایگاه تبلیغاتی
- مهاجرت دامنه یا زیرساخت
- مشکل فنی یا قطعی

## اتصال مستقیم Google Search Console

این اتصال اختیاری است. در Google Cloud یک Service Account بسازید و ایمیل آن را به‌عنوان User همان Search Console property اضافه کنید. سپس یکی از این دو روش را استفاده کنید:

```dotenv
GSC_ENABLED=true
GSC_SITE_URL=sc-domain:example.com
GSC_SERVICE_ACCOUNT_FILE=/run/secrets/gsc-service-account.json
```

یا:

```dotenv
GSC_ENABLED=true
GSC_SITE_URL=https://example.com/
GSC_SERVICE_ACCOUNT_B64=BASE64_JSON
```

سایر تنظیمات:

```dotenv
GSC_ROW_LIMIT=25000
GSC_MAX_ROWS=100000
GSC_SEARCH_TYPE=web
```

داده با ابعاد `date`, `query`, `page` و حالت `final` دریافت می‌شود. Import بر اساس ترکیب تاریخ، Query و Page idempotent است؛ تکرار همان بازه اعداد را دوبرابر نمی‌کند.

## IndexNow

IndexNow اختیاری است و فقط URLهای canonical موجود در sitemap ارسال می‌شوند:

```dotenv
INDEXNOW_ENABLED=true
INDEXNOW_KEY=YOUR_RANDOM_KEY
INDEXNOW_ENDPOINT=https://api.indexnow.org/indexnow
```

هنگام فعال‌سازی، کلید در مسیر زیر ارائه می‌شود:

```text
https://YOUR_DOMAIN/YOUR_RANDOM_KEY.txt
```

ارسال موفق به معنی تضمین crawl یا index نیست.

## تنظیمات اصلی

```dotenv
ANALYTICS_ENABLED=true
ANALYTICS_DATA_DIR=/data/analytics
ANALYTICS_TIME_ZONE=Asia/Tehran
ANALYTICS_RETENTION_DAYS=400
ANALYTICS_ADMIN_USER=admin
ANALYTICS_ADMIN_PASSWORD=...
ANALYTICS_HASH_SECRET=...
SEO_AUDIT_TIMEOUT_MS=8000
```

برای تولید رمزها:

```bash
openssl rand -base64 32
openssl rand -hex 32
```

## حریم خصوصی

- کد Mermaid و متن نمودار به eventهای آنالیتیکس اضافه نمی‌شوند.
- IP خام روی دیسک نوشته نمی‌شود.
- شناسه‌های Session و Visitor با HMAC روزانه ذخیره می‌شوند.
- DNT و GPC به‌طور پیش‌فرض رعایت می‌شوند.
- Query string کامل ذخیره نمی‌شود؛ فقط UTMهای allowlist شده ثبت می‌شوند.
- حساب Search Console فقط سطح `webmasters.readonly` می‌خواهد.

## Backup

```bash
docker run --rm \
  -v mermaid-studio_analytics_data:/source:ro \
  -v "$PWD/backups:/backup" \
  alpine sh -c 'tar czf /backup/analytics-$(date +%F).tar.gz -C /source .'
```

Volume شامل داده‌های تجمیعی، درآمد، Search Console، هدف‌ها، Annotationها و تاریخچهٔ ممیزی است.
