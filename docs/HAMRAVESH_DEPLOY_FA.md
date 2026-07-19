# راهنمای انتشار روی همروش (Darkube)

این پروژه برای اجرای مستقیم از `Dockerfile` ریشه آماده است. در همروش یک App از GitHub و شاخه `main` بسازید و تنظیمات زیر را اعمال کنید.

## تنظیمات App

| گزینه | مقدار |
|---|---|
| Dockerfile | `Dockerfile` |
| Build context | ریشه مخزن |
| Container port | `4321` |
| Port name | `http` |
| Command | خالی؛ از `CMD` ایمیج استفاده شود |
| Replica | ابتدا `1` |
| Persistent disk mount | `/data/analytics` |

فایل‌سیستم کانتینر موقت است؛ بدون دیسک متصل‌شده، داده‌های analytics و تنظیمات پنل پس از جایگزینی Pod از بین می‌روند. دیسک باید برای UID/GID برابر `1000` قابل‌نوشتن باشد. اگر mount مالکیت مناسب ندارد، در CustomConfig از `fsGroup: 1000` یا init container مورد تأیید همروش استفاده کنید.

## Environment Variables

مقادیر پایه:

```dotenv
NODE_ENV=production
HOST=0.0.0.0
PORT=4321
NO_OPEN=1
TRUST_PROXY=true
SITE_URL=https://YOUR_DOMAIN
SITE_NAME=نمودارا
ANALYTICS_ENABLED=true
ANALYTICS_DATA_DIR=/data/analytics
ANALYTICS_TIME_ZONE=Asia/Tehran
ANALYTICS_ADMIN_USER=admin
ANALYTICS_ADMIN_PASSWORD=GENERATE_A_RANDOM_VALUE
ANALYTICS_HASH_SECRET=GENERATE_A_RANDOM_VALUE
RENDER_GET_ENABLED=false
RENDER_CONCURRENCY=1
RENDER_QUEUE_MAX=10
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
PUPPETEER_NO_SANDBOX=true
ADS_ENABLED=false
ADS_EDITOR_ENABLED=false
GSC_ENABLED=false
INDEXNOW_ENABLED=false
```

Secretها را خارج از Git تولید کنید:

```bash
openssl rand -base64 32
openssl rand -hex 32
```

فهرست کامل متغیرها در [`.env.example`](../.env.example) است. تبلیغات، Search Console و IndexNow را در انتشار اول خاموش نگه دارید و فقط بعد از تأیید سرویس مربوطه فعال کنید.

## Probe و Rolling Update

در بخش CustomConfig از همین مقادیر برای کانتینر اصلی استفاده کنید. نام wrapperهای بالاتر ممکن است در نسخه‌های مختلف پنل متفاوت باشد؛ خود `readinessProbe` و `livenessProbe` باید روی container تعریف شوند.

```yaml
securityContext:
  fsGroup: 1000
containers:
  - name: app
    readinessProbe:
      httpGet:
        path: /api/ready
        port: 4321
      initialDelaySeconds: 5
      periodSeconds: 10
      timeoutSeconds: 5
      failureThreshold: 6
    livenessProbe:
      httpGet:
        path: /api/health
        port: 4321
      initialDelaySeconds: 25
      periodSeconds: 30
      timeoutSeconds: 5
      failureThreshold: 3
```

استراتژی Deploy را `RollingUpdate` بگذارید:

```yaml
type: RollingUpdate
rollingUpdate:
  maxUnavailable: 0
  maxSurge: 1
```

`/api/health` فقط زنده‌بودن process را بررسی می‌کند. `/api/ready` وقتی analytics فعال است، نوشتن و حذف یک فایل آزمایشی روی دیسک را هم بررسی می‌کند و در خرابی storage پاسخ `503` می‌دهد.

## دامنه و HTTPS

دامنه را به App متصل کنید، SSL خودکار و HTTP to HTTPS redirect را روشن کنید، سپس `SITE_URL` را دقیقاً برابر origin نهایی بگذارید. مقدار `TRUST_PROXY=true` برای تشخیص صحیح HTTPS و IP پشت ingress لازم است.

## کنترل بعد از Deploy

```bash
curl -fsS https://YOUR_DOMAIN/api/health
curl -fsS https://YOUR_DOMAIN/api/ready
curl -fsS https://YOUR_DOMAIN/sitemap.xml
curl -I https://YOUR_DOMAIN/editor
curl -I https://YOUR_DOMAIN/articles
```

در پنل ادمین با Basic Auth وارد شوید و `/api/admin/launch/readiness` را بررسی کنید. سپس یک Annotation یا هدف ذخیره کنید، App را restart کنید و ماندگاری آن را بسنجید.

انتشار را در این حالت rollback کنید: readiness پایداراً `503` است، renderهای ساده شکست می‌خورند، نرخ خطای 5xx بالا می‌رود، یا داده پنل بعد از restart باقی نمی‌ماند. برای rollback، commit قبلی را Deploy کنید و دیسک `/data/analytics` را حذف نکنید.
