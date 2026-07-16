# Runbook انتشار رسمی نمودارا

این سند برای آخرین مرحلهٔ پیش از انتشار `nemodara.ir` نوشته شده است. انتشار رسمی فقط زمانی انجام شود که خروجی `/api/admin/launch/readiness` مانع بحرانی نداشته باشد و تست واقعی Publisher Script با شناسه‌های حساب خود نمودارا انجام شده باشد.

## معماری Production

یک App در دارکوب کافی است:

```text
App: nemodara-web
Container port: 4321
Persistent disk: /data/analytics
Replica: 1
```

دو دامنه روی همان App متصل می‌شوند:

```text
https://nemodara.ir       سایت اصلی، ادیتور، محتوا و پنل ادمین
https://ads.nemodara.ir   فقط سند iframe تبلیغ ادیتور
```

Canonical، Sitemap و Search Console فقط به `nemodara.ir` تعلق دارند. دامنهٔ `ads.nemodara.ir` محتوای مستقلی برای ایندکس ندارد.

## Secretهای ضروری

```bash
openssl rand -base64 32
openssl rand -hex 32
```

مقدار اول:

```dotenv
ANALYTICS_ADMIN_PASSWORD=
```

مقدار دوم:

```dotenv
ANALYTICS_HASH_SECRET=
```

Secretها نباید در Git، Screenshot عمومی، Issue یا Log قرار بگیرند.

## پیکربندی پایه

```dotenv
NODE_ENV=production
HOST=0.0.0.0
PORT=4321
NO_OPEN=1
TRUST_PROXY=true

DOMAIN=nemodara.ir
SITE_URL=https://nemodara.ir
SITE_NAME=نمودارا
SEO_AUTHOR_NAME=تیم تحریریه نمودارا

ANALYTICS_ENABLED=true
ANALYTICS_RESPECT_DNT=true
ANALYTICS_DATA_DIR=/data/analytics
ANALYTICS_TIME_ZONE=Asia/Tehran
ANALYTICS_RETENTION_DAYS=400
ANALYTICS_ADMIN_USER=admin
ANALYTICS_ADMIN_PASSWORD=...
ANALYTICS_HASH_SECRET=...

RENDER_RATE_WINDOW_MS=60000
RENDER_RATE_MAX=20
RENDER_CONCURRENCY=1
RENDER_QUEUE_MAX=10
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
PUPPETEER_NO_SANDBOX=true
```

با ۲ گیگابایت RAM، هم‌زمانی رندر را ابتدا روی `1` نگه دارید. افزایش آن فقط بعد از مشاهدهٔ Memory و Queue واقعی انجام شود.

## راه‌اندازی تبلیغات محتوایی

ابتدا فقط یک یا دو جایگاه محتوایی را فعال کنید:

```dotenv
ADS_ENABLED=true
ADS_PROVIDER=yektanet
ADS_SCRIPT_URL=https://cdn.yektanet.com/.../rg.complete.js
ADS_SCRIPT_ID=ua-script-XXXXXXXX
ADS_ALLOWED_ORIGINS=https://cdn.yektanet.com,https://*.yektanet.com
ADS_LOAD_DELAY_MS=700

ADS_SLOT_LEARN_INLINE=...
ADS_SLOT_ARTICLE_MID=...
```

شناسه‌ها باید دقیقاً از پنل ناشر خود نمودارا گرفته شوند. بعد از ۷ تا ۱۴ روز، RPM، CTR، Fill Rate، Viewability و Core Web Vitals را بررسی و سپس جایگاه‌های دیگر را اضافه کنید.

## راه‌اندازی تبلیغ ادیتور

پس از تأیید اینکه جایگاه‌های عادی درست گزارش می‌شوند:

```dotenv
ADS_EDITOR_ENABLED=true
ADS_EDITOR_REQUIRE_CROSS_ORIGIN=true
ADS_EDITOR_FRAME_ORIGIN=https://ads.nemodara.ir
ADS_SLOT_EDITOR_RAIL=...
ADS_SLOT_EDITOR_DOCK=...
```

قبل از روشن‌کردن:

1. `ads.nemodara.ir` را به همان App متصل کنید.
2. SSL و HTTPS Redirect را فعال کنید.
3. ساب‌دامین را در حساب ناشر ثبت یا با پشتیبانی شبکه تأیید کنید.
4. جایگاه Desktop Rail را روی نمایشگر عریض و Dock را روی موبایل آزمایش کنید.
5. با DevTools تأیید کنید Publisher Script در Document اصلی `/editor` وجود ندارد.
6. متن Mermaid، CodeMirror و Local Storage دامنهٔ اصلی نباید از داخل Frame قابل دسترسی باشند.

## بررسی دیسک دائمی

از Terminal دارکوب:

```bash
id
ls -ld /data/analytics
touch /data/analytics/.write-test
rm /data/analytics/.write-test
```

سپس یک هدف یا Annotation در پنل ذخیره کنید، App را Restart کنید و ماندگاری داده را بررسی کنید.

## Smoke Test عمومی

```bash
curl -fsS https://nemodara.ir/api/health
curl -fsS https://nemodara.ir/sitemap.xml
curl -I https://nemodara.ir/editor
curl -I https://nemodara.ir/articles
curl -I https://nemodara.ir/learn
```

موارد مورد انتظار:

- `/api/health` دارای `ok: true`
- `/editor` دارای `X-Robots-Tag: noindex`
- Sitemap فقط URLهای `https://nemodara.ir` را داشته باشد
- صفحه‌های محتوا canonical مطلق و یکتا داشته باشند
- پنل ادمین بدون Basic Auth پاسخ `401` بدهد

## Smoke Test رندر

```bash
curl -fsS -X POST https://nemodara.ir/api/render \
  -H 'content-type: application/json' \
  --data '{"code":"flowchart TD; A-->B","format":"svg"}' \
  --output /tmp/nemodara.svg

grep -q '<svg' /tmp/nemodara.svg
```

برای PDF:

```bash
curl -fsS -X POST https://nemodara.ir/api/render \
  -H 'content-type: application/json' \
  --data '{"code":"flowchart TD; A-->B","format":"pdf"}' \
  --output /tmp/nemodara.pdf

grep -q '%PDF-' /tmp/nemodara.pdf
```

## بررسی Frame تبلیغ

بعد از فعال‌سازی جایگاه واقعی:

```bash
curl -I 'https://ads.nemodara.ir/ads/editor-frame?slot=editorRail'
```

انتظار می‌رود:

- `200 OK`
- `X-Robots-Tag: noindex`
- CSP دارای `frame-ancestors https://nemodara.ir`
- Parent `/editor` در `script-src` دامنهٔ CDN ناشر را مجاز نکرده باشد
- Parent فقط `ads.nemodara.ir` را در `frame-src` اضافه کرده باشد

## Search Console

1. Domain Property با نام `nemodara.ir` بسازید.
2. TXT تأیید را در DNS قرار دهید.
3. `https://nemodara.ir/sitemap.xml` را Submit کنید.
4. URLهای خانه، آموزش، مقاله‌ها و قالب‌ها را Inspect کنید.
5. Service Account خواندنی را فقط در صورت نیاز به Sync مستقیم فعال کنید.

```dotenv
GSC_ENABLED=true
GSC_SITE_URL=sc-domain:nemodara.ir
GSC_SERVICE_ACCOUNT_FILE=/run/secrets/gsc-service-account.json
```

## داشبورد آمادگی انتشار

```text
https://nemodara.ir/admin/analytics#settings
```

و API:

```bash
curl -u 'admin:PASSWORD' https://nemodara.ir/api/admin/launch/readiness
```

انتشار رسمی نباید با این موارد انجام شود:

- خطای نوشتن دیسک
- رمز نامعتبر پنل
- HMAC Secret موقت
- SITE_URL غیر HTTPS یا اشتباه
- تبلیغ ادیتور با Origin یکسان
- Frame بدون SSL

موارد Warning مانند IndexNow می‌توانند بعداً تکمیل شوند، اما باید آگاهانه ثبت شوند.

## پایش هفت روز اول

هر روز:

- Error rate و صف رندر
- Memory و CPU
- خطاهای 429، 503 و 504
- Pageview و Session
- ad slot view، ad viewable و blocked
- Impression، Click و Revenue واقعی پنل ناشر
- LCP، INP و CLS
- Coverage و Crawl Search Console

Viewability داخلی نمودارا جایگزین Impression پنل ناشر نیست.

## معیار توقف یا Rollback تبلیغ ادیتور

تبلیغ ادیتور را موقتاً خاموش کنید اگر:

- INP یا CLS به‌طور پایدار از محدودهٔ هدف خارج شد؛
- خطای JavaScript یا CSP در ادیتور افزایش یافت؛
- نرخ رندر موفق افت معنادار داشت؛
- شبکهٔ ناشر Frame را پشتیبانی نکرد؛
- گزارش کلیک نامعتبر یا هشدار سیاست دریافت شد؛
- کاربران موبایل فضای کافی برای کد یا پیش‌نمایش نداشتند.

خاموش‌کردن بدون Deploy:

```dotenv
ADS_EDITOR_ENABLED=false
```

در صورت مشکل کل شبکه:

```dotenv
ADS_ENABLED=false
```

## Backup

```bash
tar czf /tmp/nemodara-analytics-$(date +%F).tar.gz -C /data/analytics .
```

Backup شامل آمار تجمیعی، درآمد، اهداف، Annotation، Briefهای محتوا و تاریخچهٔ ممیزی است؛ کد Mermaid کاربران در آن ذخیره نمی‌شود.

## تصمیم Go / No-Go

**Go** وقتی:

- CI و Docker کامل سبز هستند؛
- دیسک ماندگار و قابل نوشتن است؛
- Launch Readiness مانع بحرانی ندارد؛
- دامنه و SSL پایدارند؛
- رندر SVG و PDF موفق است؛
- Search Console تأیید شده است؛
- جایگاه‌های واقعی ناشر روی Desktop و Mobile آزمایش شده‌اند؛
- حریم خصوصی و شرایط استفاده با رفتار واقعی هماهنگ‌اند.

**No-Go** وقتی یکی از موارد بالا فقط با فرض یا دادهٔ نمونه تأیید شده باشد.
