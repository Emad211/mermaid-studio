# تبلیغات داخل ادیتور نمودارا

این معماری برای کسب درآمد از بازدیدهای مستقیم `/editor` طراحی شده است، بدون اینکه بنر روی دکمه‌های خروجی، محیط کدنویسی یا پیش‌نمایش قرار بگیرد.

## جایگاه‌ها

```dotenv
ADS_EDITOR_ENABLED=true
ADS_SLOT_EDITOR_RAIL=
ADS_SLOT_EDITOR_DOCK=
```

- `editorRail`: در نمایشگرهای عریض، ستون مستقل ۳۰۰ پیکسلی کنار محیط کار.
- `editorDock`: در لپ‌تاپ، تبلت و موبایل، نوار مستقل زیر محیط کار.

در هر بار بارگذاری فقط یکی از دو جایگاه فعال می‌شود. تبلیغ Overlay، Popup، Interstitial یا نزدیک دکمه‌های Download و Copy نیست.

## ایزولاسیون از کد Mermaid

Production باید Frame تبلیغ را از یک Origin جدا بارگذاری کند:

```dotenv
ADS_EDITOR_FRAME_ORIGIN=https://ads.nemodara.ir
ADS_EDITOR_REQUIRE_CROSS_ORIGIN=true
```

`ads.nemodara.ir` می‌تواند دامنهٔ دوم همان App در دارکوب باشد و به App جدا نیاز ندارد. مرورگر به‌دلیل تفاوت Origin اجازه نمی‌دهد اسکریپت ناشر در Frame به DOM ادیتور، CodeMirror، Local Storage دامنهٔ اصلی یا متن Mermaid دسترسی داشته باشد.

Frame با Sandbox محدود اجرا می‌شود و فقط این مجوزها را دارد:

```text
allow-scripts
allow-same-origin        فقط وقتی Origin واقعاً جداست
allow-popups
allow-popups-to-escape-sandbox
```

اگر `ADS_EDITOR_FRAME_ORIGIN` با `SITE_URL` یکسان باشد و الزام Cross-Origin فعال باشد، جایگاه‌های ادیتور به‌صورت fail-closed غیرفعال می‌شوند.

## محدودکردن دامنهٔ تبلیغ

روی همان App دو دامنه متصل کنید:

```text
nemodara.ir
ads.nemodara.ir
```

برای هر دو SSL و HTTPS Redirect فعال باشد. دامنهٔ تبلیغ فقط این دو مسیر را ارائه می‌کند:

```text
/ads/editor-frame
/api/health
```

درخواست صفحه‌های دیگری مانند `/articles` روی `ads.nemodara.ir` به همان مسیر در `https://nemodara.ir` هدایت می‌شود. بنابراین ساب‌دامین تبلیغ نسخهٔ تکراری و قابل ایندکس سایت نمی‌سازد. Canonical سایت فقط `https://nemodara.ir` است و Frame با `noindex` ارائه می‌شود.

## انتشار مرحله‌ای

تبلیغ ادیتور را از روز اول برای تمام کاربران فعال نکنید. درصد کاربرانی که Frame را دریافت می‌کنند با این متغیر کنترل می‌شود:

```dotenv
ADS_EDITOR_TRAFFIC_PERCENT=25
ADS_EDITOR_LOAD_DELAY_MS=1800
```

انتخاب کاربر در طول همان Session ثابت می‌ماند؛ بنابراین Refresh کردن صفحه باعث جابه‌جایی پی‌درپی بین گروه کنترل و تبلیغ نمی‌شود.

پیشنهاد rollout:

```text
مرحلهٔ ۱: ۱۰٪ برای ۳ تا ۷ روز
مرحلهٔ ۲: ۲۵٪ برای ۷ روز
مرحلهٔ ۳: ۵۰٪ برای ۷ روز
مرحلهٔ ۴: ۱۰۰٪ فقط بعد از پایداربودن تجربه و درآمد
```

در هر مرحله این معیارها را با گروه قبلی مقایسه کنید:

- LCP، INP و CLS
- نرخ رندر موفق
- نرخ خروجی و اشتراک‌گذاری
- زمان ماندن در ادیتور
- Viewability جایگاه
- Blocked/Error rate
- Impression، Click، RPM و Revenue واقعی پنل ناشر

برای خاموش‌کردن فوری بدون تغییر کد:

```dotenv
ADS_EDITOR_ENABLED=false
```

و برای توقف rollout بدون حذف تنظیمات:

```dotenv
ADS_EDITOR_TRAFFIC_PERCENT=0
```

## متغیرهای کامل

```dotenv
ADS_ENABLED=true
ADS_PROVIDER=yektanet
ADS_SCRIPT_URL=https://cdn.yektanet.com/.../rg.complete.js
ADS_SCRIPT_ID=ua-script-XXXXXXXX
ADS_ALLOWED_ORIGINS=https://cdn.yektanet.com,https://*.yektanet.com
ADS_LOAD_DELAY_MS=700

ADS_EDITOR_ENABLED=true
ADS_EDITOR_REQUIRE_CROSS_ORIGIN=true
ADS_EDITOR_FRAME_ORIGIN=https://ads.nemodara.ir
ADS_EDITOR_TRAFFIC_PERCENT=25
ADS_EDITOR_LOAD_DELAY_MS=1800
ADS_SLOT_EDITOR_RAIL=pos-editor-rail-XXXXXXXX
ADS_SLOT_EDITOR_DOCK=pos-editor-dock-XXXXXXXX
```

شناسه‌ها باید دقیقاً از پنل حساب ناشر خودتان گرفته شوند. از شناسهٔ سایت یا ناشر دیگر استفاده نکنید.

## سنجش صحیح

نمودارا این رخدادها را جدا ثبت می‌کند:

- `ad_slot_view`: حداقل ۲۵٪ جایگاه وارد Viewport شده است.
- `ad_viewable`: حداقل ۵۰٪ جایگاه در تب قابل مشاهده، به مدت یک ثانیه روی صفحه بوده است.
- `ad_script_loaded`: فایل ناشر بارگذاری شده است.
- `ad_script_error`: خطای شبکه یا اجرا.
- `ad_blocked`: احتمال مسدودشدن توسط افزونه یا مرورگر.

این اعداد **Impression قابل پرداخت نیستند**. Impression، Click و Revenue معتبر باید از گزارش پنل یکتانت یا تپسل وارد داشبورد شوند.

## اصول جایگذاری

- جایگاه با برچسب روشن «تبلیغات» نمایش داده می‌شود.
- بین تبلیغ و کنترل‌های ادیتور مرز و فاصلهٔ مستقل وجود دارد.
- هیچ متن تشویق‌کننده برای کلیک وجود ندارد.
- تبلیغ روی Canvas، Modal، Export Dialog یا Fullscreen Preview قرار نمی‌گیرد.
- جایگاه بدون درخواست کاربر Refresh نمی‌شود.
- Frame پس از پایدارشدن صفحه و با تأخیر جداگانه بارگذاری می‌شود.
- فضای جایگاه قبل از First Paint رزرو می‌شود تا CLS ایجاد نشود.

## تست پیش از انتشار

```bash
npm run test:editor-ads
npm test
```

سپس در مرورگر:

1. DevTools صفحهٔ `/editor` را باز کنید.
2. تأیید کنید Publisher Script در Document اصلی وجود ندارد.
3. Frame باید از `https://ads.nemodara.ir` بارگذاری شود.
4. در Console والد نباید متن Mermaid یا Placement ID لاگ شود.
5. دکمه‌های Export و Copy یک ناحیهٔ مستقل از تبلیغ داشته باشند.
6. عرض‌های 390، 768، 1366، 1440 و 1920 پیکسل را بررسی کنید.
7. صفحه را با Network Slow 3G و CPU throttling بررسی کنید.
8. در حالت Tab پنهان، رخداد `ad_viewable` نباید ثبت شود.

## نکتهٔ سازگاری شبکه

اسکریپت یکتانت در Frame دارای اسکریپت سراسری و Placement ID همان سند است. بااین‌حال فعال‌سازی نهایی باید با جایگاه واقعی پنل و تأیید پشتیبانی شبکه انجام شود. اگر یک فرمت خاص در Frame رندر نشد، ابتدا فرمت دیگری از همان پنل را آزمایش کنید؛ ایزولاسیون را بدون بررسی حقوقی و حریم خصوصی خاموش نکنید.
