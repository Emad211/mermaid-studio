# اجرای Mermaid Studio روی لوکال با Docker

این مسیر برای تست کامل محصول، ادیتور، پنل ادمین، آنالیتیکس، رندر Chromium و ممیزی SEO روی رایانهٔ شخصی طراحی شده است. اجرای لوکال به دامنه، Caddy، HTTPS، یکتانت، تپسل یا Search Console نیاز ندارد.

## پیش‌نیاز

یکی از این دو حالت کافی است:

- Docker Desktop روی Windows، macOS یا Linux
- Docker Engine همراه Docker Compose v2 روی Linux

بررسی اولیه:

```bash
docker info
docker compose version
```

## مسیر سریع در macOS، Linux، WSL یا Git Bash

از ریشهٔ مخزن:

```bash
chmod +x scripts/docker-local.sh
./scripts/docker-local.sh up
```

اسکریپت به‌صورت خودکار:

1. فایل `.env.local` را از روی `.env.local.example` می‌سازد؛
2. رمز تصادفی پنل ادمین و HMAC secret تولید می‌کند؛
3. اعتبار Compose را بررسی می‌کند؛
4. Docker image را می‌سازد؛
5. کانتینر را فقط روی `127.0.0.1` منتشر می‌کند؛
6. تا سالم‌شدن Health Check منتظر می‌ماند؛
7. آدرس‌ها و اطلاعات ورود را در Terminal نمایش می‌دهد.

## مسیر سریع در Windows PowerShell

PowerShell را در ریشهٔ مخزن باز کنید:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\docker-local.ps1 up
```

این فرمان همان فرایند تولید Secret، Build، اجرا و Health Check را انجام می‌دهد.

## آدرس‌های پیش‌فرض

```text
صفحه اصلی   http://localhost:4321/
ادیتور      http://localhost:4321/editor
پنل ادمین   http://localhost:4321/admin/analytics
Health      http://localhost:4321/api/health
Sitemap     http://localhost:4321/sitemap.xml
```

نام کاربری و رمز پنل در فایل زیر قرار دارند:

```text
.env.local
```

نمایش مجدد اطلاعات ورود:

```bash
./scripts/docker-local.sh credentials
```

یا در PowerShell:

```powershell
.\scripts\docker-local.ps1 credentials
```

## تست سریع و تست کامل

بعد از بالا آمدن سرویس:

```bash
./scripts/docker-local.sh test
```

تست سریع این موارد را بررسی می‌کند:

- Health endpoint
- صفحهٔ اصلی، ادیتور، قالب‌ها و آموزش
- محافظت Basic Auth پنل ادمین
- ورود موفق با Credential تولیدشده
- خاموش‌بودن تبلیغات شخص ثالث
- ثبت event آنالیتیکس first-party
- API مرکز کنترل رشد
- Sitemap پویا
- رندر SVG سمت سرور

برای تست کامل:

```bash
./scripts/docker-local.sh test-full
```

تست کامل علاوه بر موارد بالا، این دو بخش سنگین‌تر را هم اجرا می‌کند:

- رندر واقعی PDF با Chromium
- ممیزی زندهٔ Technical SEO روی تمام مسیرهای canonical

PowerShell:

```powershell
.\scripts\docker-local.ps1 test
.\scripts\docker-local.ps1 test-full
```

## فرمان‌های مدیریت

| کار | macOS/Linux/WSL | PowerShell |
|---|---|---|
| ساخت تنظیمات | `./scripts/docker-local.sh setup` | `.\scripts\docker-local.ps1 setup` |
| بررسی پیش‌نیازها | `./scripts/docker-local.sh doctor` | `.\scripts\docker-local.ps1 doctor` |
| اجرا | `./scripts/docker-local.sh up` | `.\scripts\docker-local.ps1 up` |
| وضعیت | `./scripts/docker-local.sh status` | `.\scripts\docker-local.ps1 status` |
| لاگ زنده | `./scripts/docker-local.sh logs` | `.\scripts\docker-local.ps1 logs` |
| Restart | `./scripts/docker-local.sh restart` | `.\scripts\docker-local.ps1 restart` |
| توقف | `./scripts/docker-local.sh down` | `.\scripts\docker-local.ps1 down` |
| حذف دادهٔ لوکال | `./scripts/docker-local.sh reset` | `.\scripts\docker-local.ps1 reset` |
| حذف image و volume | `./scripts/docker-local.sh clean` | `.\scripts\docker-local.ps1 clean` |

فرمان `down` داده‌ها را حذف نمی‌کند. فرمان `reset` volume آنالیتیکس را حذف می‌کند، اما `.env.local` و رمز پنل را نگه می‌دارد.

اجرای بدون سؤال تأیید:

```bash
./scripts/docker-local.sh reset --yes
```

```powershell
.\scripts\docker-local.ps1 reset -Yes
```

## تغییر پورت

فایل `.env.local` را باز و مقدار زیر را تغییر دهید:

```dotenv
LOCAL_PORT=4400
```

سپس:

```bash
./scripts/docker-local.sh down
./scripts/docker-local.sh up
```

آدرس جدید:

```text
http://localhost:4400/
```

`SITE_URL` لوکال از روی همین پورت ساخته می‌شود؛ بنابراین Canonical، Sitemap و ممیزی SEO هم هماهنگ می‌مانند.

## ماندگاری داده

داده‌های پنل در volume زیر ذخیره می‌شوند:

```text
mermaid-studio-local-analytics
```

موارد ماندگار:

- آمار روزانه
- درآمد واردشده
- دادهٔ Search Console واردشده از CSV
- هدف‌های رشد
- Annotationها
- تاریخچهٔ ممیزی SEO

مشاهدهٔ volume:

```bash
docker volume inspect mermaid-studio-local-analytics
```

پشتیبان‌گیری:

```bash
mkdir -p backups
docker run --rm \
  -v mermaid-studio-local-analytics:/source:ro \
  -v "$PWD/backups:/backup" \
  alpine sh -c 'tar czf /backup/local-analytics-$(date +%F).tar.gz -C /source .'
```

## تنظیمات ایمنی لوکال

در `compose.local.yaml`:

- سرویس فقط روی `127.0.0.1` Bind می‌شود؛
- Caddy و HTTPS اجرا نمی‌شوند؛
- تبلیغات، Search Console API و IndexNow خاموش‌اند؛
- فایل‌سیستم کانتینر read-only است؛
- فقط `/tmp` و volume آنالیتیکس قابل نوشتن‌اند؛
- تمام Linux capabilityهای اضافی حذف شده‌اند؛
- `no-new-privileges` فعال است؛
- رمزها داخل `.env.local` هستند و وارد Git یا Docker image نمی‌شوند.

فایل `.dockerignore` نیز تمام `.env`های واقعی را از Build Context حذف می‌کند و فقط فایل‌های نمونه را نگه می‌دارد.

## چرا `NODE_ENV=development` است؟

Docker image، Chromium، محدودیت‌ها و کد اجرایی همان نسخهٔ اصلی‌اند؛ اما محیط لوکال HTTP است. حالت development فقط اجازه می‌دهد `SITE_URL` برابر `http://localhost:PORT` باشد. در production همچنان HTTPS اجباری و Compose اصلی همراه Caddy استفاده می‌شود.

## تست پنل ادمین

پس از ورود به پنل این مراحل را انجام دهید:

1. در «اهداف و داده» یک هدف بازدید و درآمد ثبت کنید.
2. یک Annotation برای روز جاری بسازید.
3. در «درآمد و تبلیغات» یک رکورد آزمایشی با عدد کوچک وارد کنید.
4. صفحه را Refresh کنید و ماندگاری داده را بررسی کنید.
5. در «ممیزی فنی SEO» دکمهٔ اجرای ممیزی را بزنید.
6. پنل را در عرض موبایل مرورگر بررسی کنید.
7. یک Flowchart بسازید و خروجی SVG، PNG و PDF بگیرید.

برای پاک‌کردن داده‌های آزمایشی:

```bash
./scripts/docker-local.sh reset --yes
./scripts/docker-local.sh up
```

## عیب‌یابی

### پورت ۴۳۲۱ اشغال است

در `.env.local` پورت را تغییر دهید:

```dotenv
LOCAL_PORT=4400
```

### Docker daemon در دسترس نیست

Docker Desktop را اجرا کنید و دوباره بزنید:

```bash
./scripts/docker-local.sh doctor
```

### Build قدیمی یا Cache مشکوک است

```bash
./scripts/docker-local.sh clean --yes
./scripts/docker-local.sh up
```

### پنل 401 برمی‌گرداند

اطلاعات ورود را دوباره ببینید:

```bash
./scripts/docker-local.sh credentials
```

در صورت نیاز پنجرهٔ خصوصی مرورگر باز کنید تا Credential قبلی Basic Auth پاک شود.

### کانتینر unhealthy است

```bash
./scripts/docker-local.sh logs
```

سپس وضعیت را بررسی کنید:

```bash
./scripts/docker-local.sh status
```

### PDF ساخته نمی‌شود

تست کامل را اجرا کنید:

```bash
./scripts/docker-local.sh test-full
```

این تست مشخص می‌کند Chromium داخل کانتینر واقعاً قادر به تولید PDF هست یا نه.

## اجرای مستقیم Compose

اسکریپت‌ها روش توصیه‌شده‌اند. اجرای دستی معادل:

```bash
cp .env.local.example .env.local
# دو مقدار ANALYTICS_ADMIN_PASSWORD و ANALYTICS_HASH_SECRET را پر کنید.
docker compose --env-file .env.local -f compose.local.yaml up -d --build
docker compose --env-file .env.local -f compose.local.yaml ps
```

تست داخل کانتینر:

```bash
docker compose --env-file .env.local -f compose.local.yaml exec -T app \
  node scripts/docker-local-smoke.mjs --full
```
