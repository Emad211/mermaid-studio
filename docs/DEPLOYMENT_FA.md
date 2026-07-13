# راهنمای انتشار نسخهٔ آنلاین Mermaid Studio

این راهنما برای اجرای عمومی محصول روی یک سرور یا سرویس کانتینری نوشته شده است.

## اجرای سریع با Docker

```bash
docker build -t mermaid-studio .
docker run --rm -p 4321:4321 --env-file .env mermaid-studio
```

سپس صفحهٔ اصلی روی `http://localhost:4321` و ادیتور روی
`http://localhost:4321/editor` در دسترس هستند.

## متغیرهای ضروری

فایل `.env.example` را به `.env` کپی کنید. برای نسخهٔ اینترنتی این مقادیر توصیه
می‌شوند:

```dotenv
NODE_ENV=production
HOST=0.0.0.0
PORT=4321
MSTUDIO_PUBLIC_MODE=1
MSTUDIO_ALLOW_UNSAFE_MERMAID=0
```

حالت ناامن Mermaid را روی اینترنت فعال نکنید. این حالت فقط برای محیط محلی مورد
اعتماد و سازگاری با نمودارهایی است که عمداً از HTML یا callback استفاده می‌کنند.

## تبلیغات یکتانت یا تپسل

محصول کاملاً رایگان است و درآمد نسخهٔ آنلاین فقط از تبلیغات صفحات محتوایی تأمین می‌شود. اسکریپت شبکهٔ تبلیغاتی داخل ادیتور بارگذاری نمی‌شود.

پس از تأیید سایت در پنل ناشر، URL اسکریپت سراسری و شناسهٔ هر جایگاه را در `.env` قرار دهید:

```dotenv
ADS_ENABLED=true
ADS_PROVIDER=yektanet
ADS_SCRIPT_URL=https://cdn.example.com/path/publisher.js
ADS_SCRIPT_ID=publisher-script-id
ADS_ALLOWED_ORIGINS=https://cdn.example.com,https://*.example.com
ADS_SLOT_HOME_INLINE=placement-id
ADS_SLOT_TEMPLATES_INLINE=placement-id
ADS_SLOT_LEARN_INLINE=placement-id
```

راهنمای کامل و ترتیب پیشنهادی فعال‌سازی در [`ADS_FA.md`](ADS_FA.md) آمده است. اگر `ADS_ENABLED=false` باشد یا شناسه‌ای ناقص باشد، هیچ درخواست شخص ثالثی ارسال نمی‌شود.

## محدودیت‌های پیشنهادی سرور

```dotenv
MSTUDIO_RATE_LIMIT=40
MSTUDIO_RENDER_CONCURRENCY=2
MSTUDIO_RENDER_QUEUE=20
MSTUDIO_MAX_CODE_LENGTH=120000
MSTUDIO_MAX_CSS_LENGTH=20000
MSTUDIO_MAX_CONFIG_LENGTH=40000
```

مقادیر مناسب به CPU، RAM و تعداد کاربران بستگی دارند. هر رندر PNG یا PDF یک صفحهٔ
Chromium باز می‌کند؛ بنابراین افزایش concurrency بدون اندازه‌گیری می‌تواند حافظه را
تمام کند.

## Reverse proxy

در Nginx، Caddy یا پنل میزبان، HTTPS را فعال و درخواست‌ها را به پورت برنامه هدایت
کنید. اگر فقط یک reverse proxy مورد اعتماد جلوی برنامه قرار دارد، `TRUST_PROXY=1`
را تنظیم کنید تا Rate Limit بر اساس IP واقعی کاربر اعمال شود.

## حریم خصوصی

- بدنهٔ درخواست‌های `/api/render` را در access log ذخیره نکنید.
- کد Mermaid کاربران را وارد ابزارهای analytics یا گزارش خطا نکنید.
- لاگ‌های IP را فقط به‌اندازهٔ نیاز امنیتی نگه دارید.
- از تبلیغات پاپ‌آپ یا اسکریپت‌هایی که محتوای ادیتور را می‌خوانند استفاده نکنید.

## بررسی سلامت

```bash
curl http://localhost:4321/api/health
```

پاسخ شامل نسخه، تعداد رندرهای فعال و طول صف است و برای health check میزبان قابل
استفاده است.
