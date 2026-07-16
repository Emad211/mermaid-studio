# تبلیغات داخل ادیتور نمودارا

این معماری برای کسب درآمد از بازدیدهای مستقیم `/editor` طراحی شده است، بدون اینکه بنر روی دکمه‌های خروجی، محیط کدنویسی یا پیش‌نمایش قرار بگیرد.

## جایگاه‌ها

```dotenv
ADS_EDITOR_ENABLED=true
ADS_SLOT_EDITOR_RAIL=
ADS_SLOT_EDITOR_DOCK=
```

- `editorRail`: در نمایشگرهای عریض، یک ستون مستقل در کنار محیط کار.
- `editorDock`: در لپ‌تاپ، تبلت و موبایل، یک نوار مستقل زیر محیط کار.

در هر بار بارگذاری فقط یکی از دو جایگاه فعال می‌شود. تبلیغ Overlay، Popup، Interstitial یا نزدیک دکمه‌های Download و Copy نیست.

## ایزولاسیون از کد Mermaid

پیشنهاد Production این است که Frame تبلیغ از یک Origin جدا بارگذاری شود:

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

## دامنه در دارکوب

روی همان App دو دامنه متصل کنید:

```text
nemodara.ir
ads.nemodara.ir
```

برای هر دو SSL و HTTPS Redirect فعال باشد. Canonical سایت همچنان فقط `https://nemodara.ir` است و مسیر Frame با `noindex` ارائه می‌شود.

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
ADS_SLOT_EDITOR_RAIL=pos-editor-rail-XXXXXXXX
ADS_SLOT_EDITOR_DOCK=pos-editor-dock-XXXXXXXX
```

شناسه‌ها باید دقیقاً از پنل حساب ناشر خودتان گرفته شوند. از شناسهٔ سایت یا ناشر دیگر استفاده نکنید.

## سنجش صحیح

نمودارا این رخدادها را جدا ثبت می‌کند:

- `ad_slot_view`: حداقل ۲۵٪ جایگاه وارد Viewport شده است.
- `ad_viewable`: حداقل ۵۰٪ جایگاه به مدت یک ثانیه قابل مشاهده بوده است.
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
- فضای آن قبل از First Paint رزرو می‌شود تا CLS ایجاد نشود.

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
5. دکمه‌های Export و Copy حداقل یک ناحیهٔ مستقل از تبلیغ داشته باشند.
6. عرض‌های 390، 768، 1366 و 1440 پیکسل را بررسی کنید.

## نکتهٔ سازگاری شبکه

اسکریپت یکتانت در Frame دارای اسکریپت سراسری و Placement ID همان سند است. بااین‌حال فعال‌سازی نهایی باید با جایگاه واقعی پنل و تأیید پشتیبانی شبکه انجام شود. اگر یک فرمت خاص در Frame رندر نشد، ابتدا فرمت دیگری از همان پنل را آزمایش کنید؛ ایزولاسیون را بدون بررسی حقوقی و حریم خصوصی خاموش نکنید.
