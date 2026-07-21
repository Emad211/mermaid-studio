const UPDATED = '2026-07-15';

export const LEARN_ARTICLES = [
  {
    "slug": "state-diagram-mermaid",
    "shortTitle": "نمودار حالت",
    "title": "آموزش State Diagram در Mermaid؛ از وضعیت ساده تا ماشین حالت حرفه‌ای",
    "description": "آموزش گام‌به‌گام State Diagram در Mermaid با stateDiagram-v2، انتقال، choice، حالت مرکب، fork/join، Note و مثال چرخه سفارش.",
    "keywords": [
      "آموزش State Diagram Mermaid",
      "stateDiagram-v2",
      "نمودار ماشین حالت",
      "نمودار وضعیت سفارش"
    ],
    "level": "مقدماتی تا پیشرفته",
    "minutes": 22,
    "published": "2026-07-21",
    "updated": "2026-07-21",
    "intro": "State Diagram رفتار یک موجودیت یا سیستم را با وضعیت‌ها و انتقال‌های مجاز نمایش می‌دهد. این نمودار برای چرخهٔ سفارش، تیکت پشتیبانی، نشست کاربر، دستگاه، پروتکل و هر مسئله‌ای که تعداد محدودی وضعیت مشخص دارد مناسب است. در این آموزش کدها با stateDiagram-v2 نوشته شده‌اند و می‌توانی آن‌ها را مستقیم در ادیتور نمودارا اجرا و ویرایش کنی.",
    "learningOutcomes": [
      "وضعیت شروع و پایان را تعریف کنی.",
      "برای حالت‌ها نام فنی و برچسب فارسی جدا بسازی.",
      "رویداد، شرط، choice و مسیرهای هم‌زمان را مدل کنی.",
      "ماشین حالت چرخهٔ سفارش را به یک سند قابل بازبینی تبدیل کنی."
    ],
    "sections": [
      {
        "id": "first-state-diagram",
        "title": "ساخت اولین State Diagram",
        "paragraphs": [
          "خط نخست را با stateDiagram-v2 شروع کنید. نشانهٔ [*] در ابتدای فلش وضعیت شروع و در انتهای فلش وضعیت پایان را نشان می‌دهد. هر نامی که در دو طرف فلش نوشته شود یک state است و Mermaid آن را خودکار ایجاد می‌کند.",
          "در نمونهٔ زیر سفارش ابتدا در وضعیت Draft قرار می‌گیرد، با ثبت نهایی وارد PendingPayment می‌شود و پس از پرداخت یا لغو به پایان می‌رسد. برچسب پس از دونقطه توضیح می‌دهد کدام رویداد انتقال را ایجاد کرده است."
        ],
        "code": "stateDiagram-v2\n  [*] --> Draft\n  Draft --> PendingPayment: ثبت سفارش\n  PendingPayment --> Paid: پرداخت موفق\n  PendingPayment --> Cancelled: انصراف کاربر\n  Paid --> [*]\n  Cancelled --> [*]",
        "codeLabel": "ماشین حالت سادهٔ سفارش"
      },
      {
        "id": "aliases-persian-labels",
        "title": "شناسهٔ فنی و برچسب فارسی",
        "paragraphs": [
          "شناسهٔ state را کوتاه، انگلیسی و پایدار نگه دارید تا تغییر متن فارسی باعث تغییر ارجاع‌ها نشود. برای نمایش عنوان فارسی از ساختار state \"عنوان\" as Id استفاده کنید. این الگو در تیم‌هایی که کد، دیتابیس و نمودار را هم‌زمان نگه می‌دارند بسیار مفید است.",
          "نام فنی بهتر است با enum یا قرارداد API هماهنگ باشد. اگر در کد از PENDING_PAYMENT استفاده می‌کنید، در نمودار نیز شناسه‌ای نزدیک به PendingPayment انتخاب کنید و ترجمهٔ انسانی را فقط در label قرار دهید."
        ],
        "code": "stateDiagram-v2\n  state \"پیش‌نویس\" as Draft\n  state \"در انتظار پرداخت\" as PendingPayment\n  state \"پرداخت‌شده\" as Paid\n  [*] --> Draft\n  Draft --> PendingPayment: submit\n  PendingPayment --> Paid: payment_succeeded",
        "codeLabel": "جداکردن نام فنی از متن نمایشی"
      },
      {
        "id": "events-guards",
        "title": "رویداد، Guard و Action را روی انتقال بنویسید",
        "paragraphs": [
          "Mermaid متن پس از دونقطه را به‌عنوان label انتقال نمایش می‌دهد. برای خوانایی می‌توانید از قرارداد event [guard] / action استفاده کنید؛ Mermaid این عبارت را اجرا نمی‌کند، اما به تیم کمک می‌کند منطق انتقال را دقیق و یکدست مستند کند.",
          "Guard باید شرطی باشد که در لحظهٔ رویداد بررسی می‌شود. وضعیت را با شرط اشتباه نگیرید. «موجودی تأیید شده» می‌تواند نتیجهٔ یک بررسی باشد، اما اگر قرار نیست موجودیت برای مدتی در آن باقی بماند، بهتر است روی transition نوشته شود نه به‌عنوان state مستقل."
        ],
        "code": "stateDiagram-v2\n  PendingPayment --> Paid: payment_succeeded [amount_valid]\n  Paid --> Preparing: inventory_checked [available] / reserve_items\n  Paid --> Refunded: inventory_checked [unavailable] / refund",
        "codeLabel": "قرارداد پیشنهادی برای برچسب انتقال"
      },
      {
        "id": "choice",
        "title": "شاخه‌سازی با Choice",
        "paragraphs": [
          "وقتی یک رویداد به چند مقصد احتمالی منتهی می‌شود، یک state از نوع choice تعریف کنید. خروجی‌های choice باید با شرط‌های کوتاه و متقابل برچسب‌گذاری شوند تا مشخص باشد در هر حالت کدام مسیر انتخاب می‌شود.",
          "Choice را برای تصمیم واقعی دامنه به‌کار ببرید، نه برای هر if داخلی. اگر جزئیات تصمیم فقط در سطح پیاده‌سازی اهمیت دارد، یک Flowchart جداگانه خواناتر خواهد بود."
        ],
        "code": "stateDiagram-v2\n  state stockResult <<choice>>\n  Paid --> stockResult: بررسی موجودی\n  stockResult --> Preparing: موجود است\n  stockResult --> Refunded: ناموجود است",
        "codeLabel": "انتخاب مسیر براساس نتیجهٔ موجودی"
      },
      {
        "id": "composite-states",
        "title": "گروه‌بندی با Composite State",
        "paragraphs": [
          "برای چرخه‌های بزرگ می‌توانید چند وضعیت داخلی را داخل یک state مرکب قرار دهید. این کار سطح اصلی نمودار را ساده نگه می‌دارد و جزئیات مرحله‌ای مانند آماده‌سازی، بسته‌بندی و تحویل به پست را در یک مرز مشخص جمع می‌کند.",
          "درون هر composite state می‌توان شروع و پایان مستقل تعریف کرد. از تو در تو کردن چندلایه فقط زمانی استفاده کنید که واقعاً یک سلسله‌مراتب رفتاری وجود دارد؛ در غیر این صورت چند نمودار کوچک نگهداری ساده‌تری دارند."
        ],
        "code": "stateDiagram-v2\n  [*] --> Paid\n  state Fulfillment {\n    [*] --> Preparing\n    Preparing --> Packed: بسته‌بندی کامل\n    Packed --> Shipped: تحویل به پست\n    Shipped --> [*]\n  }\n  Paid --> Fulfillment: آغاز پردازش\n  Fulfillment --> Delivered: تحویل موفق\n  Delivered --> [*]",
        "codeLabel": "وضعیت مرکب پردازش و ارسال"
      },
      {
        "id": "fork-join",
        "title": "پردازش هم‌زمان با Fork و Join",
        "paragraphs": [
          "اگر پس از یک رویداد چند بررسی مستقل هم‌زمان شروع می‌شوند، از fork برای تقسیم مسیر و join برای پیوستن دوباره استفاده کنید. نمونهٔ رایج آن بررسی موجودی و کنترل تقلب پس از پرداخت است.",
          "Fork به معنی اجرای واقعی هم‌زمان در نرم‌افزار نیست؛ فقط مدل رفتاری را نشان می‌دهد. جزئیات صف، زمان‌بندی و retry را در Sequence Diagram یا مستند اجرایی مکمل توضیح دهید."
        ],
        "code": "stateDiagram-v2\n  state verifyFork <<fork>>\n  state verifyJoin <<join>>\n  Paid --> verifyFork\n  verifyFork --> InventoryCheck\n  verifyFork --> FraudCheck\n  InventoryCheck --> verifyJoin: تأیید\n  FraudCheck --> verifyJoin: تأیید\n  verifyJoin --> Preparing",
        "codeLabel": "دو بررسی مستقل پس از پرداخت"
      },
      {
        "id": "notes-direction-style",
        "title": "Note، جهت و استایل",
        "paragraphs": [
          "با direction LR می‌توانید نمودار را افقی کنید. Note برای ثبت محدودیت مهمی مناسب است که از روی نام وضعیت یا انتقال روشن نیست؛ مانند مهلت پرداخت یا سیاست بازپرداخت. یادداشت را کوتاه نگه دارید تا جای منطق اصلی را نگیرد.",
          "برای تأکید محدود از classDef استفاده کنید. رنگ باید معنای ثابتی داشته باشد و تنها حامل اطلاعات نباشد؛ عنوان، شکل و متن باید در چاپ سیاه‌وسفید نیز قابل فهم بمانند."
        ],
        "code": "stateDiagram-v2\n  direction LR\n  [*] --> PendingPayment\n  PendingPayment --> Paid: پرداخت موفق\n  Paid --> Delivered: تحویل\n  note right of PendingPayment\n    مهلت پرداخت ۱۵ دقیقه است\n  end note\n  classDef success fill:#dcfce7,stroke:#16a34a,color:#14532d\n  class Delivered success",
        "codeLabel": "چیدمان افقی، یادداشت و تأکید محدود"
      },
      {
        "id": "complete-order-example",
        "title": "مثال کامل چرخهٔ سفارش",
        "paragraphs": [
          "نمونهٔ زیر نقطهٔ شروع مناسبی برای فروشگاه است. قبل از استفاده، نام وضعیت‌ها و انتقال‌ها را با قواعد واقعی محصول خود تطبیق دهید. اگر بازپرداخت، مرجوعی یا تحویل ناموفق رفتار متفاوتی دارد، آن را صریح اضافه کنید.",
          "منبع Mermaid را کنار تعریف وضعیت‌های backend نگه دارید و در Pull Requestهایی که enum، transition یا policy را تغییر می‌دهند، نمودار را نیز بازبینی کنید. خروجی SVG برای مستندات و فایل .mmd برای نگهداری مناسب است."
        ],
        "code": "stateDiagram-v2\n  direction LR\n  state \"پیش‌نویس\" as Draft\n  state \"در انتظار پرداخت\" as PendingPayment\n  state \"پرداخت‌شده\" as Paid\n  state \"آماده‌سازی\" as Preparing\n  state \"ارسال‌شده\" as Shipped\n  state \"تحویل‌شده\" as Delivered\n  state \"لغوشده\" as Cancelled\n  state \"مرجوع‌شده\" as Returned\n  state \"بازپرداخت‌شده\" as Refunded\n\n  [*] --> Draft\n  Draft --> PendingPayment: ثبت نهایی\n  PendingPayment --> Paid: پرداخت موفق\n  PendingPayment --> Cancelled: انصراف یا انقضا\n  Paid --> Preparing: تأیید موجودی\n  Paid --> Refunded: عدم تأمین\n  Preparing --> Shipped: تحویل به پست\n  Shipped --> Delivered: تحویل موفق\n  Shipped --> Returned: برگشت مرسوله\n  Delivered --> Returned: درخواست مرجوعی\n  Returned --> Refunded: تأیید بازپرداخت\n  Delivered --> [*]\n  Cancelled --> [*]\n  Refunded --> [*]",
        "codeLabel": "قالب قابل ویرایش چرخهٔ سفارش"
      },
      {
        "id": "common-errors",
        "title": "خطاهای رایج و چک‌لیست بازبینی",
        "paragraphs": [
          "خطاهای رایج شامل استفاده از stateDiagram قدیمی به‌جای stateDiagram-v2، شناسهٔ دارای فاصله، فراموش‌کردن end note، انتقال‌های بی‌برچسب و ساخت وضعیت‌هایی است که در واقع عملیات لحظه‌ای هستند. نمودار را از نمونهٔ کوچک شروع کنید و بخش‌ها را تدریجی اضافه کنید.",
          "اعتبار سینتکس کافی نیست. ماشین حالت باید از نظر دامنه نیز درست باشد. انتقال‌های غیرمجاز، وضعیت‌های بدون خروج، مسیرهای خطا و رفتار timeout را با توسعه‌دهنده و مالک محصول بازبینی کنید."
        ],
        "bullets": [
          "هر وضعیت تعریف روشن و بدون هم‌پوشانی دارد.",
          "هر انتقال مهم یک رویداد یا دلیل مشخص دارد.",
          "شروع، پایان، لغو و خطا دیده شده‌اند.",
          "نام‌های فنی با enum، API و دیتابیس هماهنگ‌اند.",
          "کد نمونه در نسخهٔ فعلی Mermaid رندر شده است."
        ],
        "note": "State Diagram قرارداد رفتاری را خلاصه می‌کند؛ جای تست، اعتبارسنجی backend یا مستند کامل قواعد کسب‌وکار را نمی‌گیرد."
      }
    ],
    "faq": [
      [
        "تفاوت stateDiagram و stateDiagram-v2 چیست؟",
        "stateDiagram-v2 رندرر فعلی و پیشنهادی Mermaid است. برای محتوای جدید از نسخهٔ v2 استفاده کنید، مگر اینکه سازگاری با محیط بسیار قدیمی الزام باشد."
      ],
      [
        "آیا می‌توان متن وضعیت‌ها را فارسی نوشت؟",
        "بله. بهتر است شناسهٔ فنی انگلیسی بماند و عنوان فارسی با ساختار state \"عنوان\" as Id تعریف شود تا ارجاع‌ها پایدار باشند."
      ],
      [
        "چه زمانی از Choice استفاده کنم؟",
        "وقتی یک رویداد یا نتیجهٔ بررسی می‌تواند براساس شرط‌های مشخص به چند وضعیت مقصد منتهی شود. برای جزئیات الگوریتمی ریز، Flowchart جداگانه مناسب‌تر است."
      ],
      [
        "آیا State Diagram جای Sequence Diagram را می‌گیرد؟",
        "خیر. State Diagram چرخهٔ وضعیت یک موجودیت را نشان می‌دهد؛ Sequence Diagram ترتیب پیام‌ها میان کاربر، سرویس‌ها و دیتابیس را در یک سناریو نمایش می‌دهد."
      ]
    ]
  },
  {
    slug: 'flowchart-mermaid',
    shortTitle: 'فلوچارت Mermaid',
    title: 'آموزش فلوچارت Mermaid؛ از اولین گره تا نمودار حرفه‌ای',
    description: 'آموزش گام‌به‌گام ساخت فلوچارت با Mermaid به فارسی؛ گره، فلش، شرط، زیرنمودار، استایل، خطاهای رایج و مثال قابل ویرایش.',
    keywords: ['آموزش Mermaid', 'فلوچارت Mermaid', 'ساخت فلوچارت با کد', 'نمودار فرایند'],
    level: 'مقدماتی تا متوسط',
    minutes: 18,
    intro: 'فلوچارت بهترین نقطهٔ شروع Mermaid است. با چند خط متن می‌توان یک فرایند، تصمیم، گردش کار یا الگوریتم را به نموداری تبدیل کرد که هم در مستندات فنی خواناست و هم در Git به‌سادگی نسخه‌بندی می‌شود.',
    sections: [
      {
        id: 'first-flowchart',
        title: 'ساخت اولین فلوچارت',
        paragraphs: [
          'خط اول نوع نمودار و جهت چیدمان را تعیین می‌کند. مقدار TD نمودار را از بالا به پایین و LR آن را از چپ به راست می‌چیند. هر گره یک شناسهٔ کوتاه مانند A و یک متن نمایشی داخل براکت دارد.',
          'برای اتصال گره‌ها از فلش استفاده می‌شود. متن روی مسیر را می‌توان بین دو خط تیره نوشت تا دلیل عبور از هر شاخه مشخص باشد.',
        ],
        code: `flowchart TD
  A[شروع درخواست] --> B{اطلاعات کامل است؟}
  B -- بله --> C[پردازش درخواست]
  B -- خیر --> D[تکمیل اطلاعات]
  D --> B
  C --> E[پایان]`,
        codeLabel: 'یک فرایند تصمیم‌گیری ساده',
      },
      {
        id: 'directions-shapes',
        title: 'جهت‌ها و شکل گره‌ها',
        paragraphs: [
          'جهت مناسب بر خوانایی اثر زیادی دارد. TD و TB برای فرایندهای مرحله‌ای، LR برای معماری یا زنجیرهٔ داده و BT یا RL برای سناریوهای خاص مناسب‌اند.',
          'براکت معمولی مستطیل، پرانتز گوشه‌گرد، آکولاد لوزی تصمیم و دو پرانتز دایره می‌سازد. نام شناسه را انگلیسی و کوتاه نگه دارید، اما متن داخل شکل می‌تواند کاملاً فارسی باشد.',
        ],
        bullets: [
          '`A[متن]` برای عملیات یا مرحله',
          '`B{شرط؟}` برای تصمیم دو یا چندشاخه‌ای',
          '`C((رویداد))` برای شروع، پایان یا نقطهٔ مهم',
          '`D[(دیتابیس)]` برای داده یا ذخیره‌سازی',
        ],
        code: `flowchart LR
  Start((شروع)) --> Form(تکمیل فرم)
  Form --> Check{اعتبارسنجی موفق است؟}
  Check -- بله --> DB[(ذخیره در دیتابیس)]
  Check -- خیر --> Form`,
        codeLabel: 'ترکیب شکل‌های مختلف',
      },
      {
        id: 'subgraphs',
        title: 'گروه‌بندی با subgraph',
        paragraphs: [
          'در نمودارهای بزرگ، گره‌ها را براساس سامانه، تیم یا مرحلهٔ کسب‌وکار گروه‌بندی کنید. زیرنمودارها مرزهای مفهومی را روشن می‌کنند و از تبدیل‌شدن نمودار به شبکه‌ای شلوغ جلوگیری می‌کنند.',
        ],
        code: `flowchart LR
  subgraph Client[مرورگر کاربر]
    U[فرم] --> V[اعتبارسنجی اولیه]
  end
  subgraph Server[سرور]
    API[API] --> DB[(Database)]
  end
  V --> API`,
        codeLabel: 'تفکیک مرورگر و سرور',
      },
      {
        id: 'styling',
        title: 'استایل خوانا و قابل نگهداری',
        paragraphs: [
          'برای نمودار مستندات، هدف اصلی خوانایی است؛ نه استفاده از تعداد زیادی رنگ. یک یا دو رنگ تأکیدی، کنتراست کافی و برچسب‌های کوتاه معمولاً نتیجهٔ بهتری دارند.',
          'classDef امکان تعریف یک سبک و استفادهٔ چندباره از آن را می‌دهد. این روش از تکرار style برای هر گره جلوگیری می‌کند.',
        ],
        code: `flowchart TD
  A[ورودی] --> B{بررسی}
  B -- معتبر --> C[تأیید]
  B -- نامعتبر --> D[رد]
  classDef success fill:#dcfce7,stroke:#16a34a,color:#14532d
  classDef danger fill:#fee2e2,stroke:#dc2626,color:#7f1d1d
  class C success
  class D danger`,
        codeLabel: 'سبک‌های قابل استفادهٔ مجدد',
      },
      {
        id: 'common-errors',
        title: 'خطاهای رایج فلوچارت',
        paragraphs: [
          'بیشتر خطاها از کوتیشن ناقص، براکت بسته‌نشده، شناسهٔ تکراری با معنای متفاوت یا استفاده از کلمهٔ رزروشده ایجاد می‌شوند. نمودار را مرحله‌به‌مرحله بسازید و بعد از هر بخش پیش‌نمایش را بررسی کنید.',
        ],
        bullets: [
          'متن‌های دارای پرانتز، دونقطه یا نویسه‌های ویژه را داخل کوتیشن قرار دهید.',
          'شناسهٔ گره را با عدد شروع نکنید و از فاصله در شناسه استفاده نکنید.',
          'برای نمودار بسیار بزرگ، آن را به چند نمودار هدفمند تقسیم کنید.',
          'جهت فلش را با جریان واقعی فرایند هماهنگ نگه دارید.',
        ],
        note: 'در Mermaid Studio خطای نگارشی نمایش داده می‌شود. ابتدا اولین خط گزارش‌شده را اصلاح کنید؛ خطاهای بعدی ممکن است پیامد همان مشکل باشند.',
      },
    ],
    faq: [
      ['آیا متن فارسی در فلوچارت Mermaid پشتیبانی می‌شود؟', 'بله. متن گره‌ها و برچسب مسیرها می‌تواند فارسی باشد. فقط کلمات کلیدی Mermaid مانند flowchart و subgraph باید انگلیسی باقی بمانند.'],
      ['برای فلوچارت طولانی LR بهتر است یا TD؟', 'اگر مراحل پشت سر هم و تعداد شاخه‌ها کم است TD معمولاً خواناتر است. برای زنجیرهٔ سرویس‌ها یا جریان دادهٔ افقی LR بهتر جواب می‌دهد.'],
      ['بهترین فرمت خروجی فلوچارت چیست؟', 'برای وب و مستندات SVG بهترین انتخاب است؛ چون برداری، سبک و قابل جست‌وجو است. برای ارائه یا پیام‌رسان می‌توان PNG گرفت و برای چاپ PDF مناسب است.'],
    ],
  },
  {
    slug: 'sequence-diagram-mermaid',
    shortTitle: 'نمودار توالی',
    title: 'آموزش Sequence Diagram در Mermaid برای API و معماری نرم‌افزار',
    description: 'ساخت نمودار توالی Mermaid برای درخواست API، احراز هویت، سناریوهای خطا، loop، alt و شماره‌گذاری پیام‌ها با مثال فارسی.',
    keywords: ['Sequence Diagram Mermaid', 'نمودار توالی', 'مستندسازی API', 'معماری نرم افزار'],
    level: 'مقدماتی تا پیشرفته',
    minutes: 20,
    intro: 'نمودار توالی نشان می‌دهد بازیگران و سرویس‌ها در طول زمان چه پیام‌هایی ردوبدل می‌کنند. این نمودار برای مستندسازی API، ورود کاربر، پرداخت، صف پیام و تحلیل سناریوهای خطا بسیار مناسب است.',
    sections: [
      {
        id: 'participants',
        title: 'شرکت‌کنندگان و پیام‌ها',
        paragraphs: [
          'هر participant یک جزء فنی و actor معمولاً یک کاربر یا سامانهٔ بیرونی است. ترتیب تعریف شرکت‌کنندگان، جای آن‌ها را از راست به چپ یا چپ به راست مشخص می‌کند.',
          'فلش پیوسته برای درخواست و فلش خط‌چین برای پاسخ رایج است. استفادهٔ هماهنگ از نوع فلش باعث می‌شود نمودار بدون توضیح اضافی خوانده شود.',
        ],
        code: `sequenceDiagram
  autonumber
  actor U as کاربر
  participant W as وب‌اپ
  participant A as API
  participant D as دیتابیس
  U->>W: ثبت فرم
  W->>A: POST /requests
  A->>D: INSERT request
  D-->>A: id
  A-->>W: 201 Created
  W-->>U: نمایش نتیجه`,
        codeLabel: 'درخواست و پاسخ یک API',
      },
      {
        id: 'activation',
        title: 'نمایش زمان پردازش با activate',
        paragraphs: [
          'Activation نشان می‌دهد یک سرویس در چه بازه‌ای فعال است. می‌توان از علامت + و - کنار فلش یا دستورات activate/deactivate استفاده کرد. این قابلیت برای عملیات ناهمگام یا چند فراخوانی تو در تو مفید است.',
        ],
        code: `sequenceDiagram
  participant C as Client
  participant A as API
  participant Q as Queue
  C->>+A: ایجاد گزارش
  A->>Q: افزودن Job
  A-->>-C: 202 Accepted`,
        codeLabel: 'فعال‌شدن API هنگام پردازش',
      },
      {
        id: 'alt-loop',
        title: 'شرط، مسیر خطا و حلقه',
        paragraphs: [
          'بلوک alt برای مسیرهای جایگزین، opt برای یک مسیر اختیاری و loop برای تکرار استفاده می‌شود. بهتر است فقط تصمیم‌هایی را نمایش دهید که برای فهم قرارداد سرویس اهمیت دارند.',
        ],
        code: `sequenceDiagram
  actor U as کاربر
  participant A as API
  U->>A: ورود با ایمیل و رمز
  alt اطلاعات معتبر است
    A-->>U: 200 + access token
  else رمز اشتباه است
    A-->>U: 401 Unauthorized
  end
  loop تا زمان انقضای نشست
    U->>A: درخواست محافظت‌شده
    A-->>U: پاسخ
  end`,
        codeLabel: 'مسیر موفق و ناموفق ورود',
      },
      {
        id: 'notes',
        title: 'افزودن Note و مرزهای معماری',
        paragraphs: [
          'Note برای ثبت فرض، محدودیت زمانی، قالب داده یا نکتهٔ امنیتی مناسب است. یادداشت را کوتاه نگه دارید و اطلاعاتی را بنویسید که از روی نام پیام قابل استنباط نیست.',
        ],
        code: `sequenceDiagram
  participant W as Web App
  participant P as Payment
  Note over W,P: همهٔ درخواست‌ها دارای idempotency key هستند
  W->>P: POST /payments
  P-->>W: payment_id`,
        codeLabel: 'ثبت یک قاعدهٔ مهم قرارداد',
      },
      {
        id: 'review',
        title: 'چک‌لیست بازبینی نمودار توالی',
        paragraphs: ['قبل از انتشار نمودار، آن را با قرارداد واقعی API و لاگ یک سناریوی آزمایشی مقایسه کنید. نمودار باید رفتار سیستم را توضیح دهد، نه اینکه جای مستندات کامل endpoint را بگیرد.'],
        bullets: [
          'نام پیام‌ها فعل‌محور و مشخص باشد.',
          'پاسخ‌های خطا و timeout مهم را نمایش دهید.',
          'جزئیات داخلی غیرضروری را حذف کنید.',
          'هم‌زمانی و عملیات asynchronous را با پیام یا Note روشن کنید.',
        ],
      },
    ],
    faq: [
      ['تفاوت participant و actor چیست؟', 'actor برای انسان یا سامانهٔ بیرونی با نماد بازیگر و participant برای اجزای سامانه با جعبه استفاده می‌شود. از نظر پیام‌رسانی هر دو مشابه‌اند.'],
      ['آیا Sequence Diagram جای OpenAPI را می‌گیرد؟', 'خیر. OpenAPI قرارداد دقیق endpoint را توصیف می‌کند؛ نمودار توالی مسیر تعامل چند جزء و ترتیب فراخوانی‌ها را قابل فهم می‌کند.'],
      ['چطور پاسخ async را نمایش دهم؟', 'می‌توانید پیام ورود Job به صف، پاسخ 202 و سپس callback، webhook یا polling را به‌صورت پیام‌های جدا نمایش دهید.'],
    ],
  },
  {
    slug: 'er-diagram-mermaid',
    shortTitle: 'ERD و دیتابیس',
    title: 'آموزش ER Diagram در Mermaid برای طراحی پایگاه داده',
    description: 'آموزش ساخت ERD با Mermaid؛ موجودیت، فیلد، کلید اصلی و خارجی، رابطه‌های یک‌به‌چند و چندبه‌چند با نمونه فروشگاه.',
    keywords: ['ER Diagram Mermaid', 'ERD Mermaid', 'طراحی دیتابیس', 'نمودار موجودیت رابطه'],
    level: 'متوسط',
    minutes: 18,
    intro: 'ER Diagram ساختار داده و رابطهٔ موجودیت‌ها را قبل از پیاده‌سازی یا هنگام مستندسازی پایگاه داده روشن می‌کند. Mermaid برای ERDهای مفهومی و منطقی سبک، سریع و قابل نگهداری است.',
    sections: [
      {
        id: 'entities',
        title: 'تعریف موجودیت و ویژگی',
        paragraphs: [
          'هر موجودیت با نامی روشن تعریف می‌شود و ویژگی‌ها داخل بلوک آن قرار می‌گیرند. نوع داده، نام ستون و نشان‌های PK یا FK به تیم کمک می‌کند طرح را با migrationها تطبیق دهد.',
        ],
        code: `erDiagram
  CUSTOMER {
    int id PK
    string name
    string email UK
    datetime created_at
  }
  ORDER {
    int id PK
    int customer_id FK
    decimal total
    string status
  }`,
        codeLabel: 'دو موجودیت پایه',
      },
      {
        id: 'cardinality',
        title: 'خواندن Cardinality رابطه‌ها',
        paragraphs: [
          'نمادهای کنار خط حداقل و حداکثر تعداد ارتباط را مشخص می‌کنند. برای مثال یک مشتری می‌تواند صفر تا چند سفارش داشته باشد، اما هر سفارش دقیقاً به یک مشتری تعلق دارد.',
        ],
        bullets: [
          '`||` دقیقاً یک',
          '`o|` صفر یا یک',
          '`|{` یک یا چند',
          '`o{` صفر یا چند',
        ],
        code: `erDiagram
  CUSTOMER ||--o{ ORDER : places
  ORDER ||--|{ ORDER_ITEM : contains
  PRODUCT ||--o{ ORDER_ITEM : appears_in`,
        codeLabel: 'رابطه‌های فروشگاه',
      },
      {
        id: 'many-to-many',
        title: 'شکستن رابطهٔ چندبه‌چند',
        paragraphs: [
          'در مدل رابطه‌ای، رابطهٔ چندبه‌چند معمولاً با یک موجودیت واسط شکسته می‌شود. ORDER_ITEM نه‌فقط رابطهٔ سفارش و کالا، بلکه تعداد، قیمت زمان خرید و تخفیف را نیز نگه می‌دارد.',
        ],
        code: `erDiagram
  ORDER ||--|{ ORDER_ITEM : has
  PRODUCT ||--o{ ORDER_ITEM : referenced_by
  ORDER_ITEM {
    int order_id FK
    int product_id FK
    int quantity
    decimal unit_price
  }`,
        codeLabel: 'موجودیت واسط سفارش و کالا',
      },
      {
        id: 'database-review',
        title: 'از نمودار تا Schema واقعی',
        paragraphs: [
          'ERD باید با schema و migrationهای واقعی همگام بماند. نام‌ها، nullable بودن، unique constraint، index و رفتار حذف آبشاری را در مستندات مکمل ثبت کنید؛ زیرا همهٔ جزئیات فیزیکی دیتابیس در ERD کوتاه جا نمی‌گیرد.',
        ],
        bullets: [
          'رابطهٔ مالکیت و lifecycle داده را مشخص کنید.',
          'اطلاعات حساس و سیاست نگهداری را در سند کنار نمودار توضیح دهید.',
          'برای جدول‌های بسیار بزرگ، indexهای مهم را جداگانه مستند کنید.',
          'نمودار را در همان repository migrationها نگه دارید.',
        ],
      },
    ],
    faq: [
      ['آیا Mermaid می‌تواند از دیتابیس موجود ERD بسازد؟', 'Mermaid Studio فعلاً کد Mermaid را رندر می‌کند. برای تبدیل خودکار schema باید از ابزار استخراج metadata استفاده و خروجی آن را به سینتکس Mermaid تبدیل کنید.'],
      ['PK و FK در Mermaid چه اثری روی دیتابیس دارند؟', 'این نشان‌ها فقط مستندسازی هستند و هیچ constraint واقعی ایجاد نمی‌کنند. migration یا DDL همچنان منبع اجرای دیتابیس است.'],
      ['برای مدل پیچیده یک ERD کافی است؟', 'معمولاً نه. یک نمودار سطح دامنه و چند نمودار کوچک برای bounded contextها خواناتر از یک نمودار غول‌پیکر است.'],
    ],
  },
  {
    slug: 'gantt-mermaid',
    shortTitle: 'نمودار گانت',
    title: 'آموزش نمودار Gantt در Mermaid برای برنامه‌ریزی پروژه',
    description: 'ساخت نمودار گانت Mermaid با تاریخ، مدت، وابستگی، milestone، وضعیت active/done و مثال برنامه انتشار نرم‌افزار.',
    keywords: ['Gantt Mermaid', 'نمودار گانت', 'برنامه ریزی پروژه', 'زمان بندی پروژه'],
    level: 'مقدماتی تا متوسط',
    minutes: 15,
    intro: 'Gantt زمان‌بندی فعالیت‌ها و وابستگی میان آن‌ها را روی یک خط زمانی نشان می‌دهد. نسخهٔ متنی Mermaid برای roadmap، برنامه انتشار و هماهنگی تیم‌های کوچک بسیار سریع است.',
    sections: [
      {
        id: 'basic-gantt',
        title: 'ساخت برنامهٔ انتشار',
        paragraphs: [
          'dateFormat قالب تاریخ ورودی را مشخص می‌کند. section فعالیت‌ها را گروه‌بندی می‌کند و هر task می‌تواند تاریخ شروع و مدت یا وابستگی به task قبلی داشته باشد.',
        ],
        code: `gantt
  title برنامه انتشار نسخه ۱.۰
  dateFormat YYYY-MM-DD
  axisFormat %m/%d
  section طراحی
  تحقیق کاربران :done, research, 2026-07-01, 5d
  رابط کاربری :active, ui, after research, 7d
  section توسعه
  پیاده‌سازی :dev, after ui, 10d
  تست و انتشار :release, after dev, 5d`,
        codeLabel: 'Roadmap یک نسخه',
      },
      {
        id: 'states-milestones',
        title: 'وضعیت و Milestone',
        paragraphs: [
          'برچسب done کار تمام‌شده، active کار جاری و crit مسیر حساس را برجسته می‌کند. milestone یک رویداد بدون مدت مانند انتشار، تأیید یا تحویل است.',
        ],
        code: `gantt
  title مسیر بحرانی انتشار
  dateFormat YYYY-MM-DD
  section محصول
  تثبیت Scope :done, scope, 2026-07-01, 3d
  توسعه هسته :crit, active, core, after scope, 12d
  تست امنیت :crit, security, after core, 4d
  انتشار عمومی :milestone, launch, after security, 0d`,
        codeLabel: 'مسیر بحرانی و milestone',
      },
      {
        id: 'planning-tips',
        title: 'قواعد یک گانت قابل اعتماد',
        paragraphs: [
          'نمودار گانت فقط زمانی مفید است که تاریخ‌ها و وابستگی‌ها واقعاً به‌روز بمانند. وظیفه‌های بسیار ریز را وارد نکنید؛ سطحی را انتخاب کنید که برای تصمیم‌گیری مدیریتی یا هماهنگی تیم مناسب باشد.',
        ],
        bullets: [
          'برای هر فعالیت خروجی قابل تحویل تعریف کنید.',
          'وابستگی واقعی را با after بنویسید، نه صرفاً ترتیب ظاهری.',
          'ریسک و بافر را در برنامه پنهان نکنید.',
          'نمودار را در بازه‌های منظم با وضعیت واقعی مقایسه کنید.',
        ],
      },
    ],
    faq: [
      ['آیا Mermaid تعطیلات و تقویم کاری را پشتیبانی می‌کند؟', 'امکانات تقویمی Mermaid محدودتر از نرم‌افزارهای تخصصی مدیریت پروژه است. برای زمان‌بندی عملیاتی پیچیده، Mermaid را برای ارتباط بصری و ابزار PM را منبع اصلی نگه دارید.'],
      ['چطور یک task را بعد از task دیگر شروع کنم؟', 'به task اول شناسه بدهید و در task دوم از after شناسه استفاده کنید؛ مانند `test :after dev, 5d`.'],
      ['گانت برای roadmap محصول مناسب است؟', 'بله، اگر سطح فعالیت‌ها بزرگ و هدف نمایش ترتیب و وابستگی باشد. برای backlog روزانه بهتر است از ابزار مدیریت کار استفاده شود.'],
    ],
  },
  {
    slug: 'class-diagram-mermaid',
    shortTitle: 'نمودار کلاس',
    title: 'آموزش Class Diagram در Mermaid؛ UML برای طراحی نرم‌افزار',
    description: 'آموزش نمودار کلاس Mermaid شامل ویژگی، متد، visibility، ارث‌بری، composition، aggregation و وابستگی با مثال فارسی.',
    keywords: ['Class Diagram Mermaid', 'UML Mermaid', 'نمودار کلاس', 'طراحی شی گرا'],
    level: 'متوسط',
    minutes: 17,
    intro: 'Class Diagram ساختار ایستای یک دامنه یا بخش نرم‌افزار را نشان می‌دهد. هدف آن کپی‌کردن تمام جزئیات کد نیست؛ بلکه باید مسئولیت‌ها، قراردادها و رابطه‌های مهم را روشن کند.',
    sections: [
      {
        id: 'classes',
        title: 'ویژگی‌ها و متدها',
        paragraphs: [
          'علامت + عمومی، - خصوصی و # محافظت‌شده است. نوع بازگشتی متد و نوع ویژگی را می‌توان برای شفافیت اضافه کرد. کلاس را با اعضایی پر نکنید که برای تصمیم معماری اهمیتی ندارند.',
        ],
        code: `classDiagram
  class User {
    +String name
    +String email
    -String passwordHash
    +login() Token
  }
  class Project {
    +String title
    +archive() void
  }
  User "1" --> "*" Project : owns`,
        codeLabel: 'دو کلاس و رابطهٔ مالکیت',
      },
      {
        id: 'relationships',
        title: 'رابطه‌های UML',
        paragraphs: [
          'ارث‌بری برای رابطهٔ is-a، composition برای مالکیت قوی lifecycle و aggregation برای عضویت ضعیف‌تر استفاده می‌شود. استفادهٔ اشتباه از این نمادها می‌تواند برداشت معماری نادرستی بسازد.',
        ],
        bullets: [
          '`Base <|-- Child` ارث‌بری',
          '`Whole *-- Part` ترکیب یا composition',
          '`Group o-- Member` aggregation',
          '`Client ..> Service` وابستگی',
          '`Class ..|> Interface` پیاده‌سازی قرارداد',
        ],
        code: `classDiagram
  class Repository {
    <<interface>>
    +save(entity) void
  }
  class SqlRepository
  class Service
  SqlRepository ..|> Repository
  Service ..> Repository : uses`,
        codeLabel: 'وابستگی به Interface',
      },
      {
        id: 'design-review',
        title: 'استفاده در بازبینی طراحی',
        paragraphs: [
          'نمودار کلاس باید پرسش‌های طراحی را آشکار کند: آیا یک کلاس مسئولیت‌های زیادی دارد؟ وابستگی‌ها در جهت درست‌اند؟ قراردادها تست‌پذیرند؟ مرز دامنه روشن است؟',
        ],
        bullets: [
          'فقط کلاس‌های مرتبط با سناریوی مورد بحث را بیاورید.',
          'نام رابطه را با یک فعل یا مفهوم دامنه مشخص کنید.',
          'مدل دامنه را از جزئیات framework جدا کنید.',
          'پس از تغییر مهم کد، نمودار را به‌روز کنید یا حذفش کنید.',
        ],
      },
    ],
    faq: [
      ['آیا باید تمام متدهای کلاس را نمایش دهم؟', 'خیر. فقط اعضایی را نشان دهید که برای فهم مسئولیت، قرارداد یا رابطهٔ کلاس‌ها ضروری‌اند.'],
      ['Class Diagram با ERD چه تفاوتی دارد؟', 'ERD روی دادهٔ ماندگار و cardinality تمرکز دارد؛ Class Diagram علاوه بر داده، رفتار، visibility، inheritance و dependency را نشان می‌دهد.'],
      ['می‌توان از Mermaid برای معماری Clean استفاده کرد؟', 'بله. Interfaceها، وابستگی لایه‌ها و adapterها را می‌توان نمایش داد؛ ولی برای نمای سطح سامانه شاید C4 یا flowchart مناسب‌تر باشد.'],
    ],
  },
  {
    slug: 'mindmap-mermaid',
    shortTitle: 'نقشه ذهنی',
    title: 'آموزش Mindmap در Mermaid برای ایده‌پردازی و ساختار محتوا',
    description: 'ساخت نقشه ذهنی فارسی با Mermaid برای تحلیل موضوع، برنامه محتوا، شکستن مسئله و طراحی ساختار اطلاعات.',
    keywords: ['Mindmap Mermaid', 'نقشه ذهنی', 'ایده پردازی', 'ساختار محتوا'],
    level: 'مقدماتی',
    minutes: 12,
    intro: 'Mindmap برای تبدیل یک موضوع بزرگ به شاخه‌های قابل بررسی مناسب است. برخلاف فلوچارت، هدف آن نمایش ترتیب اجرا نیست؛ بلکه رابطهٔ سلسله‌مراتبی ایده‌هاست.',
    sections: [
      {
        id: 'basic-mindmap',
        title: 'ساخت نقشهٔ ذهنی پایه',
        paragraphs: ['تورفتگی در Mindmap ساختار والد و فرزند را تعیین می‌کند. بنابراین استفادهٔ یکنواخت از فاصله و Tab اهمیت زیادی دارد.'],
        code: `mindmap
  root((محصول فارسی))
    مخاطب
      توسعه‌دهنده
      دانشجو
      مدیر محصول
    محتوا
      آموزش
      قالب آماده
      مثال واقعی
    رشد
      SEO
      شبکه اجتماعی
      تبلیغات`,
        codeLabel: 'نقشهٔ ذهنی یک محصول',
      },
      {
        id: 'content-plan',
        title: 'استفاده برای معماری اطلاعات و SEO',
        paragraphs: [
          'قبل از نوشتن مقاله‌ها، موضوع اصلی را به intentهای کاربر و خوشه‌های فرعی تقسیم کنید. هر شاخه می‌تواند یک صفحهٔ pillar یا مقالهٔ پشتیبان باشد و ارتباط شاخه‌ها به طراحی لینک داخلی کمک کند.',
        ],
        code: `mindmap
  root((آموزش Mermaid))
    انواع نمودار
      فلوچارت
      Sequence
      ERD
      Gantt
    نیاز کاربر
      یادگیری سینتکس
      رفع خطا
      خروجی تصویر
      قالب آماده
    محتوای مقایسه‌ای
      Mermaid یا PlantUML
      SVG یا PNG`,
        codeLabel: 'خوشهٔ محتوایی آموزش Mermaid',
      },
      {
        id: 'mindmap-tips',
        title: 'نکات خوانایی',
        paragraphs: ['نقشهٔ ذهنی را روی یک سؤال مشخص متمرکز نگه دارید. اگر شاخه‌ها از چند سطح بیشتر شدند، بعضی شاخه‌ها را به نقشه‌های مستقل تبدیل کنید.'],
        bullets: [
          'برای هر شاخه از عبارت کوتاه و هم‌سطح استفاده کنید.',
          'شاخه‌های مشابه را با ساختار دستوری یکسان نام‌گذاری کنید.',
          'ترتیب شاخه‌ها را براساس اهمیت یا جریان فکر تنظیم کنید.',
          'نقشه را به فهرست اقدام یا سند تفصیلی متصل کنید.',
        ],
      },
    ],
    faq: [
      ['Mindmap برای برنامهٔ پروژه مناسب است؟', 'برای کشف scope و دسته‌بندی کارها مناسب است، اما برای زمان‌بندی و وابستگی از Gantt یا flowchart استفاده کنید.'],
      ['آیا ترتیب شاخه‌ها مهم است؟', 'از نظر معنا نه، ولی ترتیب دیداری روی درک مخاطب اثر دارد؛ شاخه‌های مهم‌تر را زودتر تعریف کنید.'],
      ['چطور نقشهٔ بزرگ را خوانا کنم؟', 'عمق را محدود کنید، واژه‌ها را کوتاه نگه دارید و هر شاخهٔ بزرگ را به یک نمودار مستقل تبدیل کنید.'],
    ],
  },
  {
    slug: 'architecture-diagram-mermaid',
    shortTitle: 'نمودار معماری',
    title: 'ساخت نمودار معماری نرم‌افزار با Mermaid و آیکون‌های ابری',
    description: 'آموزش نمودار معماری Mermaid برای سرویس‌ها، API، دیتابیس، صف و زیرساخت ابری همراه با اصول طراحی یک دیاگرام قابل اعتماد.',
    keywords: ['Mermaid architecture diagram', 'نمودار معماری نرم افزار', 'معماری ابری', 'دیاگرام سیستم'],
    level: 'متوسط تا پیشرفته',
    minutes: 19,
    intro: 'نمودار معماری باید یک سؤال مشخص را پاسخ دهد: اجزای اصلی کدام‌اند، داده چگونه حرکت می‌کند و مرز اعتماد یا مسئولیت کجاست. Mermaid امکان نگهداری این نمودار کنار کد را فراهم می‌کند.',
    sections: [
      {
        id: 'architecture-beta',
        title: 'تعریف گروه و سرویس',
        paragraphs: [
          'در syntax معماری، group یک مرز مانند Cloud، VPC یا سامانه و service یک جزء قابل استقرار است. اتصال‌ها از جهت‌های L، R، T و B استفاده می‌کنند.',
        ],
        code: `architecture-beta
  group cloud(logos:aws)[Cloud]
  service api(logos:aws-lambda)[API] in cloud
  service db(logos:aws-rds)[Database] in cloud
  service queue(logos:aws-sqs)[Queue] in cloud
  api:R --> L:db
  api:B --> T:queue`,
        codeLabel: 'معماری سادهٔ ابری',
      },
      {
        id: 'trust-boundaries',
        title: 'نمایش مرز اعتماد و جریان داده',
        paragraphs: [
          'هر خط باید معنای مشخصی داشته باشد: درخواست HTTP، رویداد، replication یا دسترسی مدیریتی. برای امنیت، نمودار جداگانه‌ای از مرز اینترنت، شبکهٔ خصوصی، secrets و دادهٔ حساس بسازید.',
        ],
        bullets: [
          'پروتکل یا نوع پیام را در سند کنار نمودار بنویسید.',
          'مسیرهای asynchronous را از درخواست synchronous تفکیک کنید.',
          'single point of failure را پنهان نکنید.',
          'محیط production و development را در یک نمودار مخلوط نکنید.',
        ],
      },
      {
        id: 'levels',
        title: 'یک نمودار برای همه‌چیز نسازید',
        paragraphs: [
          'برای مخاطب مدیریتی نمای Context، برای تیم فنی نمای Container و برای یک قابلیت پیچیده نمای Component یا Sequence مناسب است. تعداد محدود نمودار هدفمند از یک تصویر بزرگ و غیرقابل نگهداری ارزشمندتر است.',
        ],
        note: 'نام سرویس‌ها را با واژگان واقعی deployment و monitoring هماهنگ کنید تا نمودار هنگام incident هم قابل استفاده باشد.',
      },
    ],
    faq: [
      ['آیا Architecture Diagram Mermaid جای C4 را می‌گیرد؟', 'نه لزوماً. C4 یک روش مدل‌سازی با سطوح مشخص است؛ syntax معماری Mermaid ابزار ترسیم است. می‌توانید هر کدام را متناسب با مخاطب انتخاب کنید.'],
      ['آیکون‌های ابری از کجا می‌آیند؟', 'Mermaid Studio چند icon pack را به‌صورت محلی ارائه می‌کند. نام pack و آیکون باید معتبر باشد؛ مانند logos:aws-lambda.'],
      ['آیا نمودار باید تمام سرویس‌ها را نشان دهد؟', 'فقط اجزایی را بیاورید که برای سؤال نمودار لازم‌اند. سرویس‌های کم‌اهمیت را گروه‌بندی یا در نمای جداگانه نمایش دهید.'],
    ],
  },
  {
    slug: 'mermaid-errors',
    shortTitle: 'رفع خطای Mermaid',
    title: 'راهنمای رفع خطاهای Mermaid؛ تشخیص Syntax Error مرحله‌به‌مرحله',
    description: 'روش سیستماتیک رفع خطای Mermaid شامل براکت، کوتیشن، کلمات رزروشده، جهت فلش، تورفتگی، نسخه و config با مثال‌های خراب و اصلاح‌شده.',
    keywords: ['Mermaid syntax error', 'رفع خطای Mermaid', 'Mermaid parse error', 'اشکال زدایی نمودار'],
    level: 'همه سطوح',
    minutes: 16,
    intro: 'پیام Parser همیشه دقیقاً علت اصلی را نشان نمی‌دهد؛ گاهی یک کوتیشن یا براکت ناقص در خط قبلی باعث می‌شود خط بعدی به‌عنوان محل خطا گزارش شود. روش زیر زمان اشکال‌زدایی را کوتاه می‌کند.',
    sections: [
      {
        id: 'minimal-case',
        title: 'ابتدا یک نمونهٔ حداقلی بسازید',
        paragraphs: [
          'نیمی از نمودار را موقتاً حذف کنید. اگر خطا باقی ماند، نیم دیگر را حذف کنید. با این روش دودویی سریعاً به کوچک‌ترین بخش خراب می‌رسید. قبل از حذف، یک کپی از کد نگه دارید.',
        ],
        code: `flowchart TD
  A[شروع] --> B{شرط؟}
  B -- بله --> C[پایان]`,
        codeLabel: 'هستهٔ سالم برای افزودن تدریجی',
      },
      {
        id: 'quotes-brackets',
        title: 'کوتیشن و براکت را بررسی کنید',
        paragraphs: [
          'متن شامل پرانتز، دونقطه، هشتگ، علامت‌های HTML یا بعضی نویسه‌های ویژه را داخل کوتیشن قرار دهید. هر براکت باز باید بسته شود و نوع ابتدا و انتهای شکل باید با هم سازگار باشد.',
        ],
        code: `flowchart LR
  A["درخواست: POST /api/items"] --> B{"وضعیت (معتبر) است؟"}
  B -- بله --> C["پاسخ 201"]`,
        codeLabel: 'متن ویژه داخل کوتیشن',
      },
      {
        id: 'reserved-identifiers',
        title: 'شناسه و کلمهٔ رزروشده',
        paragraphs: [
          'شناسه را ساده و انگلیسی نگه دارید. متن نمایشی می‌تواند فارسی باشد. استفاده از فاصله، شروع با عدد یا انتخاب واژه‌ای که parser آن را keyword می‌داند، احتمال خطا را بالا می‌برد.',
        ],
        bullets: [
          'خوب: `paymentService[سرویس پرداخت]`',
          'نامناسب: `payment service[سرویس پرداخت]`',
          'برای متن طولانی از شناسهٔ کوتاه و label جدا استفاده کنید.',
          'کامنت را با `%%` در خط جدا یا انتهای خط معتبر بنویسید.',
        ],
      },
      {
        id: 'indentation-version',
        title: 'تورفتگی و تفاوت نسخه‌ها',
        paragraphs: [
          'در Mindmap و بعضی syntaxها تورفتگی بخشی از ساختار است. همچنین قابلیت‌های beta یا جدید ممکن است در نسخهٔ قدیمی Mermaid شناخته نشوند. نسخهٔ محیط رندر را با مستندات نمونه مقایسه کنید.',
        ],
        note: 'هنگام گزارش باگ، کوچک‌ترین کد بازتولید، نسخهٔ Mermaid، مرورگر و متن کامل خطا را ضمیمه کنید؛ ولی دادهٔ محرمانهٔ نمودار را ارسال نکنید.',
      },
      {
        id: 'config-css',
        title: 'Config و CSS را جداگانه آزمایش کنید',
        paragraphs: [
          'اگر کد پایه رندر می‌شود اما با config یا CSS خطا دارد، تنظیمات را خالی کنید و کلیدها را یکی‌یکی برگردانید. JSON باید کوتیشن دوتایی، ویرگول درست و مقدار معتبر داشته باشد.',
        ],
        code: `{
  "themeVariables": {
    "primaryColor": "#8b5cf6",
    "fontFamily": "Vazirmatn, Tahoma, sans-serif"
  },
  "flowchart": {
    "curve": "basis"
  }
}`,
        codeLabel: 'نمونه Config معتبر JSON',
      },
    ],
    faq: [
      ['چرا خط گزارش‌شده با علت واقعی فرق دارد؟', 'Parser ممکن است تا خط بعدی منتظر بسته‌شدن عبارت بماند؛ بنابراین خط قبلی را هم برای کوتیشن، براکت و keyword ناقص بررسی کنید.'],
      ['چطور بفهمم مشکل از CSS است؟', 'CSS و config را موقتاً خالی کنید. اگر نمودار رندر شد، آن‌ها را بخش‌به‌بخش برگردانید تا قانون خراب مشخص شود.'],
      ['آیا می‌توان کد Mermaid خراب را خودکار اصلاح کرد؟', 'بعضی خطاها قابل تشخیص‌اند، اما اصلاح خودکار همیشه امن نیست؛ چون ممکن است معنای نمودار را تغییر دهد. نمونهٔ حداقلی و بازبینی انسانی مطمئن‌تر است.'],
    ],
  },
];

const ARTICLE_MAP = new Map(LEARN_ARTICLES.map((article) => [article.slug, article]));

function formatPersianDate(value) {
  const date = new Date(`${String(value || UPDATED)}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('fa-IR', {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(date);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function inlineMarkdown(value) {
  return escapeHtml(value).replace(/`([^`]+)`/g, '<code>$1</code>');
}

function articleLinks(currentSlug) {
  const currentIndex = LEARN_ARTICLES.findIndex((article) => article.slug === currentSlug);
  const previous = currentIndex > 0 ? LEARN_ARTICLES[currentIndex - 1] : null;
  const next = currentIndex >= 0 && currentIndex < LEARN_ARTICLES.length - 1 ? LEARN_ARTICLES[currentIndex + 1] : null;
  return { previous, next };
}

function renderSection(section, index) {
  const paragraphs = (section.paragraphs || []).map((paragraph) => `<p>${inlineMarkdown(paragraph)}</p>`).join('');
  const bullets = section.bullets?.length
    ? `<ul>${section.bullets.map((bullet) => `<li>${inlineMarkdown(bullet)}</li>`).join('')}</ul>`
    : '';
  const code = section.code
    ? `<div class="code-example"><div class="code-example-head"><span>${escapeHtml(section.codeLabel || `example-${index + 1}.mmd`)}</span><button type="button" data-copy-target="code-${index}">کپی کد</button><a data-open-target="code-${index}" href="/editor">بازکردن در ادیتور</a></div><pre><code id="code-${index}">${escapeHtml(section.code)}</code></pre><div class="code-practice"><span>تمرین کوتاه: یکی از نام‌ها یا مسیرها را تغییر بده و نتیجه را ببین.</span><a data-open-target="code-${index}" href="/editor">آزمایش این مثال ←</a></div></div>`
    : '';
  const note = section.note ? `<div class="note"><strong>نکتهٔ عملی:</strong> ${inlineMarkdown(section.note)}</div>` : '';
  return `<section class="article-section" id="${escapeHtml(section.id)}"><header class="article-section-header"><span class="article-section-number">${String(index + 1).padStart(2, '0')}</span><h2>${escapeHtml(section.title)}</h2></header>${paragraphs}${bullets}${code}${note}</section>`;
}

function relatedArticles(currentSlug) {
  const index = LEARN_ARTICLES.findIndex((article) => article.slug === currentSlug);
  const candidates = [
    LEARN_ARTICLES[index - 1],
    LEARN_ARTICLES[index + 1],
    LEARN_ARTICLES[index + 2],
    LEARN_ARTICLES[index - 2],
  ].filter(Boolean);
  return [...new Map(candidates.map((article) => [article.slug, article])).values()].slice(0, 2);
}

export function getLearnArticle(slug) {
  return ARTICLE_MAP.get(String(slug || '')) || null;
}

export function learnSitemapEntries() {
  return LEARN_ARTICLES.map((article) => ({
    path: `/learn/${article.slug}`,
    updated: article.updated || UPDATED,
    priority: 0.82,
  }));
}

export function renderLearnArticle(slug) {
  const article = getLearnArticle(slug);
  if (!article) return null;
  const links = articleLinks(article.slug);
  const related = relatedArticles(article.slug);
  const toc = article.sections.map((section) => `<a href="#${escapeHtml(section.id)}">${escapeHtml(section.title)}</a>`).join('');
  const faq = article.faq.map(([question, answer]) => `<details><summary>${escapeHtml(question)}</summary><p>${escapeHtml(answer)}</p></details>`).join('');
  const outcomes = article.sections.slice(0, 4).map((section) => `<li>${escapeHtml(section.title)}</li>`).join('');
  const navigation = `<nav class="doc-next" aria-label="درس‌های قبلی و بعدی">${links.previous ? `<a href="/learn/${links.previous.slug}"><small>درس قبلی</small>${escapeHtml(links.previous.shortTitle)}</a>` : '<span></span>'}${links.next ? `<a href="/learn/${links.next.slug}"><small>درس بعدی</small>${escapeHtml(links.next.shortTitle)}</a>` : `<a href="/templates"><small>مرحلهٔ بعد</small>قالب‌های آماده</a>`}</nav>`;
  const relatedCards = related.map((item) => `<a class="related-card" href="/learn/${item.slug}"><small>${escapeHtml(item.level)}</small><strong>${escapeHtml(item.shortTitle)}</strong><span>${item.minutes.toLocaleString('fa-IR')} دقیقه مطالعه</span></a>`).join('');

  return `<!doctype html>
<html lang="fa" dir="rtl" data-theme="light">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="theme-color" content="#f5f3ed" />
  <title>${escapeHtml(article.title)} | نمودارا</title>
  <meta name="description" content="${escapeHtml(article.description)}" />
  <link rel="icon" href="/logo.svg" type="image/svg+xml" />
  <link rel="stylesheet" href="/css/landing.css?v=%V%" />
  <link rel="stylesheet" href="/css/landing-utilities.css?v=%V%" />
  <link rel="stylesheet" href="/css/docs.css?v=%V%" />
  <link rel="stylesheet" href="/css/ads.css?v=%V%" />
</head>
<body class="docs-body article-page">
  <a class="skip-link" href="#article-main">رفتن به متن مقاله</a>
  <div class="article-progress" aria-hidden="true"><i id="article-progress"></i></div>
  <header class="docs-header">
    <a class="brand" href="/" aria-label="نمودارا، صفحهٔ اصلی"><img class="brand-mark" src="/logo.svg" width="38" height="38" alt="" /><span class="brand-copy"><strong>نمودارا</strong><small>مرجع فارسی Mermaid</small></span></a>
    <nav aria-label="ناوبری آموزش"><a href="/">خانه</a><a class="is-current" href="/learn">آموزش</a><a href="/templates">قالب‌ها</a></nav>
    <div class="header-actions"><button id="theme-toggle" class="icon-button" type="button" aria-label="تغییر پوسته">◐</button><a class="button button-small" href="/editor">بازکردن ادیتور</a></div>
  </header>

  <aside class="ad-slot ad-slot--compact" data-ad-slot="learnTop" hidden aria-label="تبلیغات"><span class="ad-slot__label">تبلیغات</span><a class="ad-slot__privacy" href="/privacy#advertising">درباره تبلیغات</a><div class="ad-slot__mount" data-ad-mount></div></aside>

  <main id="article-main" class="article-shell">
    <nav class="breadcrumbs" aria-label="مسیر مقاله"><a href="/">خانه</a><span>/</span><a href="/learn">آموزش Mermaid</a><span>/</span><span>${escapeHtml(article.shortTitle)}</span></nav>
    <article>
      <header class="article-hero">
        <p class="eyebrow">راهنمای عملی ${escapeHtml(article.shortTitle)}</p>
        <h1>${escapeHtml(article.title)}</h1>
        <p class="article-deck">${escapeHtml(article.intro)}</p>
        <div class="article-meta"><span>${escapeHtml(article.level)}</span><span>${article.minutes.toLocaleString('fa-IR')} دقیقه مطالعه</span><span>به‌روزرسانی ${formatPersianDate(article.updated || article.published)}</span><span>مثال‌های قابل ویرایش</span></div>
        <div class="article-actions"><a class="button button-primary" href="/editor">تمرین در ادیتور</a><a class="text-link" href="/learn">بازگشت به مسیر آموزش</a></div>
      </header>

      <div class="article-layout">
        <div class="article-main">
          <details class="mobile-toc"><summary>فهرست این راهنما</summary><nav data-article-toc>${toc}<a href="#faq">پرسش‌های رایج</a></nav></details>
          <section class="article-summary"><span>در پایان این راهنما</span><h2>می‌توانی این بخش‌ها را با اطمینان بسازی</h2><ul>${outcomes}</ul></section>
          ${article.sections.map(renderSection).join('')}
          <section class="article-section" id="faq"><header class="article-section-header"><span class="article-section-number">؟</span><h2>پرسش‌های رایج</h2></header><div class="article-faq">${faq}</div></section>
          ${relatedCards ? `<section class="article-related"><h2>برای ادامهٔ مسیر</h2><div class="related-grid">${relatedCards}</div></section>` : ''}
          ${navigation}
          <aside class="ad-slot ad-slot--compact" data-ad-slot="learnInline" hidden aria-label="تبلیغات"><span class="ad-slot__label">تبلیغات</span><a class="ad-slot__privacy" href="/privacy#advertising">درباره تبلیغات</a><div class="ad-slot__mount" data-ad-mount></div></aside>
        </div>
        <aside class="article-aside"><div class="article-aside-box"><h2>در این راهنما</h2><nav data-article-toc>${toc}<a href="#faq">پرسش‌های رایج</a></nav><a class="button button-secondary sidebar-cta" href="/editor">ساخت نمودار</a></div></aside>
      </div>
    </article>
  </main>

  <footer class="docs-footer"><div><strong>نمودارا</strong><span>آموزش و ابزار رایگان Mermaid برای فارسی‌زبان‌ها</span></div><nav><a href="/learn">همهٔ آموزش‌ها</a><a href="/templates">قالب‌ها</a><a href="/privacy">حریم خصوصی</a><a href="https://github.com/Emad211/mermaid-studio" target="_blank" rel="noreferrer">GitHub</a></nav></footer>
  <script type="module" src="/js/docs.js?v=%V%"></script>
  <script type="module" src="/js/ads.js?v=%V%"></script>
</body>
</html>`;
}
