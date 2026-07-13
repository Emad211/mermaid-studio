# راهنمای انتشار نسخهٔ آنلاین Mermaid Studio

این راهنما برای اجرای عمومی محصول رایگان Mermaid Studio روی یک سرور دارای Docker نوشته شده است. مسیر پیشنهادی production از Docker Compose و Caddy استفاده می‌کند تا HTTPS، health check و راه‌اندازی مجدد سرویس به‌صورت استاندارد مدیریت شوند.

## پیش‌نیازها

- یک سرور Linux با Docker Engine و Docker Compose
- دامنه‌ای که رکوردهای DNS آن به IP سرور اشاره می‌کنند
- دسترسی عمومی پورت‌های ۸۰ و ۴۴۳
- حداقل حدود ۲ گیگابایت RAM؛ برای ترافیک یا رندر PDF بیشتر، منابع بالاتر توصیه می‌شود

## اجرای نهایی با Docker Compose

```bash
cp .env.example .env
```

در فایل `.env` مقدار دامنه را تغییر دهید:

```dotenv
DOMAIN=diagram.example.com
```

سپس:

```bash
docker compose build --pull
docker compose up -d
docker compose ps
```

Caddy برای دامنهٔ معتبر به‌طور خودکار گواهی HTTPS دریافت می‌کند. صفحهٔ اصلی روی دامنه و ادیتور روی `/editor` در دسترس خواهد بود.

## متغیرهای اصلی سرور

```dotenv
HOST=0.0.0.0
PORT=4321
TRUST_PROXY=true
FORCE_HSTS=false
NO_OPEN=1
```

`TRUST_PROXY=true` در ترکیب رسمی Compose لازم است، چون Caddy reverse proxy مورد اعتماد جلوی برنامه قرار دارد. اگر برنامه را بدون proxy مستقیماً اجرا می‌کنید، این مقدار را `false` قرار دهید.

## محافظت API رندر

```dotenv
RENDER_RATE_WINDOW_MS=60000
RENDER_RATE_MAX=30
RENDER_CONCURRENCY=2
RENDER_QUEUE_MAX=20
JSON_BODY_LIMIT=256kb
```

هر رندر سروری می‌تواند یک صفحهٔ Chromium باز کند. افزایش هم‌زمانی بدون پایش RAM و CPU ممکن است سرویس را ناپایدار کند. خروجی‌های معمول تصویری ابتدا در مرورگر ساخته می‌شوند تا هزینهٔ سرور کاهش یابد.

## Chromium در کانتینر

ترکیب رسمی Compose این مقدار را تنظیم می‌کند:

```dotenv
PUPPETEER_NO_SANDBOX=true
```

Sandbox داخلی Chromium در بسیاری از میزبان‌های Docker در دسترس نیست؛ به همین دلیل کانتینر برنامه با کاربر غیرروت، فایل‌سیستم read-only، شبکهٔ backend داخلی، حذف capabilityها، `no-new-privileges`، محدودیت PID و فضای موقت محدود اجرا می‌شود. اگر محیط اختصاصی شما user namespace و sandbox Chromium را به‌درستی پشتیبانی می‌کند، می‌توانید این مقدار را `false` آزمایش کنید.

## تبلیغات یکتانت یا تپسل

محصول کاملاً رایگان است و درآمد نسخهٔ عمومی فقط از تبلیغات صفحات محتوایی تأمین می‌شود. هیچ اسکریپت تبلیغاتی در `/editor` یا `/headless` بارگذاری نمی‌شود.

سایت را ابتدا با تبلیغات خاموش منتشر کنید:

```dotenv
ADS_ENABLED=false
```

پس از تأیید دامنه در پنل ناشر، URL اسکریپت و شناسه‌های واقعی را وارد کنید:

```dotenv
ADS_ENABLED=true
ADS_PROVIDER=yektanet
ADS_SCRIPT_URL=https://cdn.yektanet.com/.../rg.complete.js
ADS_SCRIPT_ID=ua-script-XXXXXXXX
ADS_ALLOWED_ORIGINS=https://cdn.yektanet.com,https://*.yektanet.com
ADS_LOAD_DELAY_MS=700

ADS_SLOT_HOME_TOP=
ADS_SLOT_HOME_INLINE=pos-article-display-card-111111
ADS_SLOT_TEMPLATES_TOP=
ADS_SLOT_TEMPLATES_INLINE=pos-article-display-card-222222
ADS_SLOT_LEARN_TOP=
ADS_SLOT_LEARN_INLINE=pos-article-display-card-333333
```

مقادیر نمونه را با داده‌های دقیق پنل خودتان جایگزین کنید. راهنمای کامل در [`ADS_FA.md`](ADS_FA.md) قرار دارد. اگر تنظیمات ناقص یا `ADS_ENABLED=false` باشد، مرورگر هیچ درخواست تبلیغاتی شخص ثالثی ارسال نمی‌کند.

## بررسی سلامت و لاگ‌ها

```bash
curl -fsS https://YOUR_DOMAIN/api/health
docker compose logs --tail=200 app
docker compose logs --tail=200 caddy
```

پاسخ سلامت شامل نسخه و وضعیت صف رندر است. بدنهٔ درخواست‌های `/api/render` یا کد Mermaid کاربران را در access log، analytics یا سامانهٔ گزارش خطا ذخیره نکنید.

## به‌روزرسانی

```bash
git pull --ff-only
docker compose build --pull
docker compose up -d --remove-orphans
curl -fsS https://YOUR_DOMAIN/api/health
```

## بازگشت به نسخهٔ قبلی

برنامه پایگاه داده ندارد. برای rollback، commit یا image قبلی را اجرا و فایل `.env` سازگار با همان نسخه را بازیابی کنید. داده‌های Caddy در volumeهای `caddy_data` و `caddy_config` نگهداری می‌شوند و نباید هنگام rollback عادی حذف شوند.
