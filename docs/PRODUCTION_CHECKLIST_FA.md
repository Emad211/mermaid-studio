# چک‌لیست نهایی انتشار Mermaid Studio

## قبل از انتشار

- یک دامنه و سرور Linux دارای Docker تهیه کنید.
- رکورد DNS دامنه را به IP سرور متصل کنید.
- پورت‌های ۸۰ و ۴۴۳ را در firewall باز کنید.
- `.env.example` را به `.env` کپی کنید.
- `DOMAIN` را روی دامنهٔ واقعی قرار دهید.
- در ترکیب رسمی Caddy، مقدار `TRUST_PROXY=true` را نگه دارید.
- مقدار `PUPPETEER_NO_SANDBOX=true` در Compose همراه با ایزولاسیون کانتینر اعمال شده است؛ capabilityها، دسترسی نوشتن، شبکه و تعداد پردازش‌ها را بدون بررسی امنیتی باز نکنید.

## تبلیغات

- اولین انتشار را با `ADS_ENABLED=false` انجام دهید.
- دامنه را در پنل ناشر یکتانت یا تپسل ثبت و تأیید کنید.
- URL اسکریپت، شناسهٔ اسکریپت، originهای مجاز و شناسهٔ هر جایگاه را دقیقاً از پنل کپی کنید.
- ابتدا فقط جایگاه‌های میان‌صفحه را فعال کنید و سرعت و درآمد را اندازه بگیرید.
- سپس `ADS_ENABLED=true` را فعال و سرویس app را restart کنید.
- با DevTools بررسی کنید هیچ اسکریپت تبلیغاتی در `/editor` یا `/headless` بارگذاری نمی‌شود.
- روی تبلیغات خودتان کلیک نکنید و ترافیک یا کلیک مصنوعی ایجاد نکنید.

## تست قبل از انتشار

```bash
npm ci
npm run build
npm test
npm run smoke:production
cp .env.example .env
docker compose config --quiet
```

## اجرای production

```bash
docker compose build --pull
docker compose up -d
docker compose ps
curl -fsS https://YOUR_DOMAIN/api/health
```

Caddy به‌صورت خودکار HTTPS را برای دامنهٔ معتبر دریافت می‌کند. وضعیت هر دو سرویس `app` و `caddy` باید پایدار باشد.

## کنترل پس از انتشار

- مسیرهای `/`، `/editor`، `/templates`، `/learn`، `/privacy` و `/terms` کد ۲۰۰ برگردانند.
- `/api/health` مقدار `ok: true` برگرداند.
- یک خروجی SVG و یک PDF آزمایشی ساخته شود.
- هدر CSP در ادیتور فقط منابع first-party را مجاز کند.
- endpoint `/api/ads` در حالت اولیه `enabled: false` برگرداند.
- پس از فعال‌سازی تبلیغات، فقط originهای دقیق پنل در CSP ظاهر شوند.
- لاگ‌ها شامل بدنهٔ درخواست یا کد Mermaid کاربران نباشند.
- مصرف RAM، CPU، طول صف رندر و خطاهای 429/503 پایش شوند.

## فرمان‌های بررسی

```bash
docker compose logs --tail=200 app
docker compose logs --tail=200 caddy
curl -I https://YOUR_DOMAIN/editor
curl -fsS https://YOUR_DOMAIN/api/ads
```

## پشتیبان‌گیری و بازگشت

برنامه پایگاه داده ندارد؛ بنابراین commit یا Docker image، فایل `.env` و تنظیمات Caddy دارایی‌های اصلی استقرار هستند. volumeهای Caddy را در rollback عادی حذف نکنید. برای بازگشت، نسخهٔ قبلی را اجرا و health check را دوباره بررسی کنید.
