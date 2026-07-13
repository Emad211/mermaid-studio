# Mermaid Studio — راهنمای فارسی محصول

Mermaid Studio یک استودیوی رایگان و متن‌باز برای ساخت و خروجی گرفتن از نمودارهای Mermaid است. محصول فارسی، بدون ثبت‌نام و بدون پلن پولی باقی می‌ماند و درآمد نسخهٔ عمومی فقط از تبلیغات ناشری ایرانی در صفحات محتوایی تأمین می‌شود؛ ادیتور هیچ اسکریپت تبلیغاتی شخص ثالثی بارگذاری نمی‌کند.

## شروع سریع بدون Docker

```bash
npm install
npm run serve
```

پس از اجرا:

- صفحه معرفی محصول: `http://127.0.0.1:4321/`
- ادیتور: `http://127.0.0.1:4321/editor`
- سلامت سرویس: `http://127.0.0.1:4321/api/health`
- مرکز کنترل رشد: `http://127.0.0.1:4321/admin/analytics`

## اجرای لوکال با Docker

این مسیر برای تست کامل محصول، پنل ادمین، آنالیتیکس، Chromium و ممیزی SEO پیشنهاد می‌شود. دامنه، HTTPS، Caddy و حساب تبلیغاتی لازم نیستند.

macOS، Linux، WSL یا Git Bash:

```bash
chmod +x scripts/docker-local.sh
./scripts/docker-local.sh up
./scripts/docker-local.sh test-full
```

Windows PowerShell:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\docker-local.ps1 up
.\scripts\docker-local.ps1 test-full
```

اسکریپت به‌صورت خودکار `.env.local` و Secretهای امن را می‌سازد، Image را Build می‌کند، تا Healthy شدن کانتینر منتظر می‌ماند و آدرس‌ها و Credential پنل ادمین را نمایش می‌دهد. سرویس فقط روی `127.0.0.1` منتشر می‌شود.

فرمان‌های مفید:

```bash
./scripts/docker-local.sh status
./scripts/docker-local.sh logs
./scripts/docker-local.sh down
./scripts/docker-local.sh reset --yes
```

راهنمای کامل و عیب‌یابی در [`docs/LOCAL_DOCKER_FA.md`](docs/LOCAL_DOCKER_FA.md) قرار دارد.

## امکانات نسخه فارسی

- صفحه فرود فارسی و واکنش‌گرا
- ادیتور فارسی با حفظ جهت چپ‌به‌راست برای کد
- تم روشن و تیره
- پیش‌نمایش زنده و تشخیص نوع نمودار
- خروجی SVG، PNG، JPG، WebP و PDF
- کتابخانهٔ قالب‌ها و خوشهٔ محتوایی آموزش فارسی
- صفحات حریم خصوصی و قوانین استفاده
- لینک اشتراک‌گذاری بدون حساب کاربری
- PWA manifest و لوگوی مستقل
- زیرساخت اختیاری یکتانت یا تپسل فقط در صفحات محتوایی
- مرکز کنترل first-party برای بازدید، قیف محصول، درآمد، Web Vitals و Search Console
- ممیزی زندهٔ Technical SEO، اهداف رشد، Annotation و هشدارهای عملیاتی

## مرکز کنترل رشد، درآمد و SEO

مسیر `/admin/analytics` با HTTP Basic Auth محافظت می‌شود و شش بخش مدیریتی دارد:

1. **نمای کلی:** KPI، مقایسه با بازهٔ قبلی، هشدار، قیف و هدف‌ها
2. **درآمد و تبلیغات:** Page RPM، Session RPM، eCPM، CTR، CPC، Fill Rate و عملکرد جایگاه
3. **رشد ارگانیک:** Query/Page سرچ کنسول، فرصت CTR، فاصله تا صفحه اول و ماتریس محتوا
4. **ممیزی فنی SEO:** Canonical، indexability، sitemap، robots، structured data، Title/H1، لینک داخلی و عملکرد
5. **تجربه و محصول:** Core Web Vitals، رندر، خروجی، کانال و دستگاه
6. **اهداف و داده:** هدف‌های رشد، Annotation، سلامت ذخیره‌سازی و Backup

داشبورد می‌تواند دادهٔ Search Console را از CSV وارد کند یا به‌صورت اختیاری با Service Account و API رسمی همگام شود. اتصال IndexNow نیز اختیاری است. هیچ‌کدام از این اتصال‌ها برای اجرای پایهٔ محصول اجباری نیستند.

داده‌ها روی volume مستقل ذخیره می‌شوند؛ IP خام، کد Mermaid و متن نمودار ثبت نمی‌شود. راهنمای کامل در [`docs/ADMIN_GROWTH_FA.md`](docs/ADMIN_GROWTH_FA.md) و [`docs/ANALYTICS_FA.md`](docs/ANALYTICS_FA.md) قرار دارد.

## معماری SEO

- canonical مطلق و redirect دائمی URLهای تکراری
- sitemap و robots پویا
- Open Graph، Twitter Card و verification meta
- JSON-LD متناسب با نوع صفحه
- مقاله‌های مستقل و سروررندرشده برای Flowchart، Sequence، ERD، Gantt، Class، Mindmap، Architecture و خطاهای Mermaid
- noindex برای ادیتور، API، headless، admin و 404
- اندازه‌گیری Core Web Vitals واقعی
- ممیزی داخلی برای جلوگیری از regression فنی پس از هر انتشار

راهنمای تنظیم دامنه، Search Console، structured data و استراتژی محتوا در [`docs/SEO_FA.md`](docs/SEO_FA.md) است.

## انتشار نهایی با Docker Compose

برای اجرای production همراه با HTTPS خودکار:

```bash
cp .env.example .env
# DOMAIN، SITE_URL و رمزهای analytics را تنظیم کنید.
docker compose build --pull
docker compose up -d
```

چک‌لیست کامل در [`docs/PRODUCTION_CHECKLIST_FA.md`](docs/PRODUCTION_CHECKLIST_FA.md) قرار دارد.
راهنمای اتصال تبلیغات در [`docs/ADS_FA.md`](docs/ADS_FA.md) است.

## استقرار روی سرور

متغیرهای محیطی مهم در فایل `.env.example` مستند شده‌اند. برای نسخهٔ عمومی حداقل این موارد را تنظیم کنید:

```dotenv
NODE_ENV=production
HOST=0.0.0.0
PORT=4321
DOMAIN=diagram.example.com
SITE_URL=https://diagram.example.com
TRUST_PROXY=true
ANALYTICS_ENABLED=true
ANALYTICS_ADMIN_USER=admin
ANALYTICS_ADMIN_PASSWORD=
ANALYTICS_HASH_SECRET=
ADS_ENABLED=false
```

برای رمز داشبورد و secret تحلیل دو مقدار طولانی و مستقل بسازید. Compose اجازهٔ اجرا با مقدار خالی را نمی‌دهد. ابتدا با تبلیغات خاموش منتشر کنید؛ بعد از تأیید دامنه در پنل ناشر، مقادیر دقیق اسکریپت و جایگاه‌ها را از پنل کپی و `ADS_ENABLED=true` را فعال کنید.

راهنمای کامل در [`docs/DEPLOYMENT_FA.md`](docs/DEPLOYMENT_FA.md) قرار دارد.

## اتصال‌های اختیاری رشد

```dotenv
# Google Search Console API
GSC_ENABLED=false
GSC_SITE_URL=sc-domain:example.com
GSC_SERVICE_ACCOUNT_FILE=
GSC_SERVICE_ACCOUNT_B64=

# IndexNow
INDEXNOW_ENABLED=false
INDEXNOW_KEY=
```

برای Search Console، ایمیل Service Account باید به همان property اضافه شود. کلیدها و JSON حساب سرویس را هرگز در Git commit نکنید.

## حریم خصوصی و امنیت

- پیش‌نمایش و بیشتر خروجی‌های تصویری در مرورگر تولید می‌شوند.
- خروجی PDF و API ممکن است کد را فقط برای همان درخواست به سرور ارسال کنند.
- برنامه کد نمودار را به‌صورت دائمی در پایگاه داده ذخیره نمی‌کند.
- لینک اشتراک‌گذاری، وضعیت را در hash آدرس نگه می‌دارد.
- Mermaid در نسخهٔ عمومی با `securityLevel: strict` اجرا می‌شود.
- API رندر دارای محدودیت حجم، نرخ درخواست، صف و هم‌زمانی است.
- آنالیتیکس first-party از HMAC روزانه استفاده و DNT/GPC را رعایت می‌کند.
- مسیرهای مدیریتی Basic Auth، rate limit، Same-Origin و `noindex` دارند.
- اسکریپت‌های تبلیغاتی فقط در صفحهٔ اصلی، قالب‌ها و آموزش بارگذاری می‌شوند؛ نه در `/editor` یا `/headless`.

## تست

```bash
npm ci
npm run build
npm test
npm run test:admin
npm run smoke:production
```

CI علاوه بر تست منبع، هر دو فایل Compose، ساخت Docker image، محیط لوکال ایزوله، volume ماندگار analytics و smoke test رندر SVG/PDF را بررسی می‌کند.

## مدل درآمد

- تمام قابلیت‌های اصلی رایگان‌اند.
- هیچ اشتراک، پرداخت، پلن Pro یا قابلیت قفل‌شده‌ای وجود ندارد.
- درآمد نسخهٔ عمومی فقط از تبلیغات ناشری ایرانی در صفحات محتوایی است.
- تبلیغات پاپ‌آپ، کلیک اجباری یا تبلیغ داخل فایل خروجی استفاده نمی‌شود.

## مجوز

کد پروژه تحت مجوز MIT منتشر می‌شود. مجوز و اعلان‌های کتابخانه‌های وابسته نیز باید رعایت شوند.
