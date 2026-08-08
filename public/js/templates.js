import { startBidiIsolation } from './bidi.js';

const templates = [
  {
    "id": "nemodara-system-context-c4",
    "category": "software",
    "badge": "معماری C4",
    "title": "System Context سامانهٔ انتشار محتوا",
    "description": "قالب C4Context برای نمایش خواننده، ویرایشگر، مدیر محتوا، سامانهٔ اصلی و وابستگی‌های GitHub و Search Console.",
    "keywords": "C4 Diagram Mermaid System Context معماری نرم افزار قالب نمودارا وابستگی بیرونی",
    "tutorial": "/learn/c4-diagram-mermaid",
    "article": "/articles/c4-diagram-vs-architecture-diagram-for-software-docs",
    "code": "C4Context\n  title System Context سامانه انتشار محتوای نمودارا\n  Person(reader, \"خواننده\", \"آموزش و مقالهٔ Mermaid را مطالعه می‌کند\")\n  Person(editor, \"ویرایشگر\", \"محتوا و مثال‌ها را آماده می‌کند\")\n  Person(admin, \"مدیر محتوا\", \"سلامت انتشار را بررسی می‌کند\")\n  System(nemodara, \"نمودارا\", \"ادیتور و مرجع فارسی Mermaid را ارائه می‌کند\")\n  System_Ext(github, \"GitHub\", \"مخزن کد، Pull Request و CI\")\n  System_Ext(search, \"Google Search Console\", \"دادهٔ جست‌وجو و وضعیت Index\")\n  Rel(reader, nemodara, \"صفحه‌ها را مطالعه و قالب را باز می‌کند\", \"HTTPS\")\n  Rel(editor, nemodara, \"محتوای ساختاریافته را آماده می‌کند\")\n  Rel(admin, nemodara, \"سلامت محتوا را پایش می‌کند\")\n  Rel(nemodara, github, \"تغییرات را نسخه‌بندی و اعتبارسنجی می‌کند\", \"Git\")\n  Rel(admin, search, \"دادهٔ جست‌وجو را بررسی می‌کند\", \"Search Console\")"
  },
  {
    "id": "content-publishing-service-block-diagram",
    "category": "software",
    "badge": "معماری سیستم",
    "title": "معماری سرویس انتشار محتوا",
    "description": "قالب Block Diagram برای نمایش بازیگران، Gateway، سرویس‌ها، Queue، Worker و پایگاه داده در سه لایهٔ قابل ویرایش.",
    "keywords": "Block Diagram Mermaid نمودار بلوکی معماری سرویس انتشار محتوا API Queue Worker",
    "tutorial": "/learn/block-diagram-mermaid",
    "article": "/articles/block-diagram-vs-flowchart-for-system-overview",
    "code": "block\n  columns 5\n  user[\"کاربر\"] space gateway[\"API Gateway\"] space admin[\"مدیر محتوا\"]\n  space:5\n  web[\"Web App\"] space auth[\"Auth\"] space content[\"Content API\"]\n  space:5\n  worker[\"Worker\"] space queue[\"Queue\"] space db[(\"PostgreSQL\")]\n  user --> web\n  admin --> web\n  web --> gateway\n  gateway --> auth\n  gateway --> content\n  content --> queue\n  queue --> worker\n  worker --> db\n  content --> db"
  },
  {
    "id": "repository-storage-usage-treemap",
    "category": "data",
    "badge": "داده سلسله‌مراتبی",
    "title": "مصرف فضای Repository براساس بخش",
    "description": "قالب Treemap فارسی برای نمایش سهم کد، آزمون، دارایی و اسناد از فضای Repository با زیرگروه‌های قابل ویرایش.",
    "keywords": "Treemap Mermaid نمودار درختی مصرف فضا Repository سلسله مراتب سهم از کل قالب داده",
    "tutorial": "/learn/treemap-mermaid",
    "article": "/articles/treemap-vs-pie-chart-for-hierarchical-composition",
    "code": "---\nconfig:\n  treemap:\n    padding: 7\n    diagramPadding: 14\n    showValues: true\n    labelFontSize: 14\n    valueFontSize: 12\n---\ntreemap-beta\n  \"مصرف فضای Repository\"\n    \"کد اصلی\"\n      \"Frontend\": 320\n      \"Backend\": 240\n    \"آزمون\"\n      \"Unit\": 120\n      \"Integration\": 80\n    \"دارایی\"\n      \"تصویر\": 180\n      \"فونت\": 60\n    \"اسناد\": 45\n\n  classDef focus fill:#eef6f2,stroke:#174d3a,stroke-width:2px,color:#12352a;"
  },
  {
    "id": "telemetry-packet-header",
    "category": "software",
    "badge": "پروتکل و شبکه",
    "title": "هدر بستهٔ تله‌متری ۱۲۰ بیتی",
    "description": "قالب Packet Diagram برای مستندسازی Version، Flags، شناسهٔ دستگاه، زمان، طول Payload، نوع پیام، Sequence و Checksum.",
    "keywords": "Packet Diagram Mermaid نمودار بسته شبکه هدر پروتکل telemetry binary fields بیت offset",
    "tutorial": "/learn/packet-diagram-mermaid",
    "article": "/articles/packet-diagram-vs-sequence-diagram-for-protocol-docs",
    "code": "---\ntitle: \"TELEMETRY_V1 header — 120 bits\"\n---\npacket\n  0-3: \"Version\"\n  4-7: \"Flags\"\n  8-23: \"Device ID\"\n  24-55: \"Timestamp\"\n  56-71: \"Payload length\"\n  72-87: \"Message type\"\n  88-103: \"Sequence\"\n  104-119: \"Checksum\""
  },
  {
    "id": "learning-to-export-user-flow-sankey",
    "category": "data",
    "badge": "جریان کمی",
    "title": "جریان کاربران از آموزش تا خروجی",
    "description": "قالب Sankey برای نمایش نمونه‌ای از ورود کاربران، مطالعهٔ مثال، بازکردن ادیتور، رندر و خروجی؛ با راهنمای فارسی و برچسب‌های ASCII سازگار با Parser فعلی Mermaid.",
    "keywords": "Sankey Mermaid نمودار سنکی جریان کاربران ریزش آموزش ادیتور خروجی قالب",
    "tutorial": "/learn/sankey-diagram-mermaid",
    "article": "/articles/sankey-diagram-vs-flowchart-for-quantitative-flows",
    "code": "---\nconfig:\n  sankey:\n    width: 960\n    height: 540\n    showValues: true\n    linkColor: gradient\n    nodeAlignment: justify\n    labelStyle: outlined\n    nodeWidth: 14\n    nodePadding: 18\n---\nsankey-beta\nSearch entry,Tutorial view,100\nTutorial view,Example view,65\nTutorial view,Early exit,35\nExample view,Open editor,30\nExample view,Exit after reading,35\nOpen editor,Render success,24\nOpen editor,Render error,6\nRender success,Export file,15\nRender success,No export,9"
  },
  {
    "id": "incident-root-cause-fishbone",
    "category": "software",
    "badge": "تحلیل علت",
    "title": "تحلیل علت شکست انتشار نسخه",
    "description": "قالب Ishikawa برای دسته‌بندی فرضیه‌های کد، فرایند، زیرساخت، آزمون، مشاهده‌پذیری و هماهنگی در Postmortem انتشار.",
    "keywords": "نمودار استخوان ماهی Ishikawa Mermaid تحلیل علت ریشه ای Incident انتشار نسخه Postmortem",
    "tutorial": "/learn/ishikawa-diagram-mermaid",
    "article": "/articles/fishbone-diagram-vs-five-whys-root-cause-analysis",
    "code": "ishikawa-beta\n    شکست انتشار نسخه و اختلال ورود\n    فرایند\n        چک لیست انتشار قدیمی بود\n        مالک تأیید نهایی مشخص نبود\n    کد\n        تغییر Schema سازگاری عقب رو نداشت\n        Feature Flag مقدار پیش فرض نداشت\n    زیرساخت\n        Secret محیط منقضی شده بود\n        ظرفیت اتصال برای بار واقعی کافی نبود\n    آزمون\n        Smoke Test مسیر ورود را پوشش نمی داد\n        Rollback در محیط مشابه تمرین نشده بود\n    مشاهده پذیری\n        هشدار نرخ خطا دیر فعال شد\n        Dashboard نسخه استقرار را نشان نمی داد\n    هماهنگی\n        کانال Incident از قبل تعریف نشده بود\n        مسئول تصمیم Rollback روشن نبود"
  },
  {
    "id": "product-backlog-impact-effort",
    "category": "planning",
    "badge": "اولویت‌بندی محصول",
    "title": "ماتریس اثر و تلاش Backlog محصول",
    "description": "قالب Quadrant Chart برای مقایسهٔ چند گزینهٔ Backlog روی اثر و تلاش، با چهار ربع تصمیم و داده‌های صریحاً نمونه.",
    "keywords": "Quadrant Chart ماتریس اثر تلاش اولویت بندی Backlog محصول قالب Mermaid",
    "tutorial": "/learn/quadrant-chart-mermaid",
    "article": "/articles/quadrant-chart-vs-scoring-table-for-prioritization",
    "code": "---\nconfig:\n  quadrantChart:\n    chartWidth: 820\n    chartHeight: 720\n---\nquadrantChart\n  title اولویت‌بندی Backlog محصول — داده نمونه\n  x-axis تلاش کم --> تلاش زیاد\n  y-axis اثر کم --> اثر زیاد\n  quadrant-1 سرمایه‌گذاری راهبردی\n  quadrant-2 پیروزی سریع\n  quadrant-3 بهبود کوچک\n  quadrant-4 بازنگری یا توقف\n  بهبود جست‌وجوی قالب‌ها: [0.25, 0.82]\n  رفع خطای خروجی موبایل: [0.35, 0.76]\n  فضای کاری تیمی: [0.78, 0.90]\n  اصلاح جزئی آیکن‌ها: [0.18, 0.28]\n  بازنویسی کامل ادیتور: [0.90, 0.35]"
  },
  {
    "id": "support-escalation-swimlane",
    "category": "process",
    "badge": "مسئولیت فرایند",
    "title": "رسیدگی و ارجاع تیکت پشتیبانی",
    "description": "قالب Swimlane برای نمایش ثبت تیکت، بررسی پشتیبانی، تصمیم محصول، ارجاع فنی، پاسخ و مسیر تکمیل اطلاعات.",
    "keywords": "Swimlane Mermaid نمودار خط شنا پشتیبانی تیکت ارجاع مسئولیت handoff فرایند بین تیمی",
    "tutorial": "/learn/swimlane-diagram-mermaid",
    "article": "/articles/swimlane-vs-flowchart-for-cross-team-processes",
    "code": "swimlane-beta LR\n  accTitle: فرایند رسیدگی و ارجاع تیکت پشتیبانی\n  accDescr: کاربر تیکت را ثبت می‌کند، پشتیبانی آن را بررسی می‌کند و در صورت نیاز محصول و فنی برای تصمیم و اصلاح وارد فرایند می‌شوند.\n\n  subgraph customer [کاربر]\n    open([ثبت تیکت])\n    addInfo[تکمیل اطلاعات]\n    confirm([تأیید نتیجه])\n  end\n\n  subgraph support [پشتیبانی]\n    triage[بررسی و دسته‌بندی]\n    complete{اطلاعات کامل است؟}\n    known{پاسخ شناخته‌شده است؟}\n    reply[ارسال پاسخ]\n  end\n\n  subgraph product [محصول]\n    accept{تغییر پذیرفته می‌شود؟}\n    document[ثبت دلیل و اولویت]\n  end\n\n  subgraph engineering [تیم فنی]\n    investigate[تحلیل فنی]\n    implement[پیاده‌سازی و آزمون]\n  end\n\n  open -->|توضیح و شواهد| triage --> complete\n  complete -->|خیر| addInfo -->|اطلاعات تکمیلی| triage\n  complete -->|بله| known\n  known -->|بله| reply --> confirm\n  known -->|خیر| accept\n  accept -->|رد یا تعویق| document --> reply\n  accept -->|پذیرفته شد| investigate --> implement -->|نسخه آماده| reply"
  },
  {
    "id": "release-readiness-radar",
    "category": "data",
    "badge": "مقایسه چندمعیاره",
    "title": "آمادگی انتشار در برابر آستانه",
    "description": "قالب Radar Chart برای مقایسهٔ وضعیت فعلی انتشار با آستانهٔ پذیرش روی تست، مستندات، امنیت، مشاهده‌پذیری و بازگشت.",
    "keywords": "Radar Chart Mermaid radar-beta نمودار راداری آمادگی انتشار مقایسه چندمعیاره release readiness",
    "tutorial": "/learn/radar-chart-mermaid",
    "article": "/articles/radar-chart-vs-bar-chart-for-multicriteria-comparison",
    "code": "radar-beta\n  title آمادگی انتشار — داده آموزشی\n  axis tests[\"تست\"], docs[\"مستندات\"], security[\"امنیت\"]\n  axis observability[\"مشاهده‌پذیری\"], rollback[\"بازگشت\"], support[\"پشتیبانی\"]\n  curve actual[\"وضعیت فعلی\"]{tests: 4, docs: 3, security: 4, observability: 2, rollback: 2, support: 3}\n  curve threshold[\"آستانه پذیرش\"]{tests: 4, docs: 4, security: 5, observability: 4, rollback: 4, support: 3}\n  showLegend true\n  min 0\n  max 5\n  graticule polygon\n  ticks 5"
  },
  {
    "id": "sprint-capacity-donut",
    "category": "data",
    "badge": "ترکیب داده",
    "title": "ترکیب ظرفیت Sprint",
    "description": "قالب Donut برای نمایش سهم قابلیت جدید، رفع باگ، بدهی فنی و پشتیبانی از ظرفیت برنامه‌ریزی‌شدهٔ Sprint.",
    "keywords": "Pie Chart Mermaid Donut نمودار دایره ای سهم از کل ظرفیت Sprint برنامه ریزی تیم",
    "tutorial": "/learn/pie-chart-mermaid",
    "article": "/articles/pie-chart-vs-bar-chart-for-composition",
    "code": "---\nconfig:\n  pie:\n    donutHole: 0.42\n    legendPosition: bottom\n    textPosition: 0.72\n    highlightSlice: \"قابلیت جدید\"\n---\npie showData\n  title ترکیب ظرفیت Sprint - داده نمونه\n  \"قابلیت جدید\" : 45\n  \"رفع باگ\" : 25\n  \"بدهی فنی\" : 20\n  \"پشتیبانی\" : 10"
  },
  {
    "id": "monthly-metrics-xy-chart",
    "category": "data",
    "badge": "نمودار داده",
    "title": "عملکرد ماهانه در برابر هدف",
    "description": "قالب XY Chart برای مقایسهٔ مقدار واقعی و هدف ماهانه با نمودار میله‌ای و خطی هم‌واحد.",
    "keywords": "xy chart xychart نمودار خطی نمودار میله ای عملکرد ماهانه هدف گزارش داده",
    "tutorial": "/learn/xy-chart-mermaid",
    "article": "/articles/mermaid-xy-chart-vs-dashboard",
    "code": "---\nconfig:\n  xyChart:\n    width: 920\n    height: 540\n    showDataLabel: true\n    showDataLabelOutsideBar: true\n  themeVariables:\n    xyChart:\n      plotColorPalette: \"#174d3a, #d85f35\"\n---\nxychart\n  title \"عملکرد ماهانهٔ تکمیل مستندات\"\n  x-axis [\"فروردین\", \"اردیبهشت\", \"خرداد\", \"تیر\", \"مرداد\", \"شهریور\"]\n  y-axis \"تعداد سند تکمیل‌شده\" 0 --> 30\n  bar [11, 14, 18, 19, 24, 27]\n  line [10, 14, 18, 22, 26, 30]"
  },
  {
    "id": "ecommerce-user-journey",
    "category": "process",
    "badge": "تجربه کاربر",
    "title": "سفر خرید فروشگاه اینترنتی",
    "description": "قالب Journey Diagram برای کشف محصول، خرید، پرداخت، تحویل و پشتیبانی با امتیاز تجربه و چند بازیگر.",
    "keywords": "نقشه سفر کاربر user journey Mermaid خرید فروشگاه تجربه کاربر پرداخت تحویل قالب",
    "tutorial": "/learn/user-journey-mermaid",
    "article": "/articles/user-journey-vs-user-flow",
    "code": "journey\n  title سفر خرید نخست در فروشگاه اینترنتی\n  section کشف و ارزیابی\n    ورود از جست‌وجو: 4: کاربر\n    بررسی صفحه محصول: 3: کاربر\n    خواندن نظرها: 4: کاربر\n  section خرید\n    افزودن به سبد: 5: کاربر\n    مشاهده هزینه ارسال: 2: کاربر\n    تکمیل اطلاعات: 3: کاربر\n    پرداخت سفارش: 4: کاربر, پرداخت\n  section تحویل و پشتیبانی\n    دریافت پیام پیگیری: 4: کاربر, فروشگاه\n    مشاهده وضعیت مرسوله: 3: کاربر, ارسال\n    تحویل سفارش: 5: کاربر, ارسال\n    ثبت بازخورد: 4: کاربر, پشتیبانی"
  },
  {
    "id": "secure-login-requirements",
    "category": "software",
    "badge": "نیازمندی‌ها",
    "title": "ردیابی نیازمندی ورود امن",
    "description": "قالب Requirement Diagram برای اتصال نیازهای امنیت ورود به سرویس احراز هویت، آزمون‌ها و مدرک بازبینی.",
    "keywords": "Requirement Diagram نمودار نیازمندی ردیابی نیازمندی امنیت ورود satisfies verifies traceability",
    "tutorial": "/learn/requirement-diagram-mermaid",
    "article": "/articles/requirement-diagram-vs-traceability-matrix",
    "code": "requirementDiagram\n  direction LR\n\n  requirement auth_security {\n    id: \"AUTH-000\"\n    text: \"ورود باید در برابر سوءاستفاده مقاوم باشد\"\n    risk: high\n    verifymethod: analysis\n  }\n\n  functionalRequirement secure_login {\n    id: \"AUTH-001\"\n    text: \"اطلاعات ورود باید به‌صورت امن بررسی شود\"\n    risk: high\n    verifymethod: test\n  }\n\n  functionalRequirement rate_limit {\n    id: \"AUTH-002\"\n    text: \"تلاش ناموفق متوالی باید محدود شود\"\n    risk: high\n    verifymethod: test\n  }\n\n  interfaceRequirement audit_event {\n    id: \"AUTH-003\"\n    text: \"نتیجهٔ ورود باید رویداد امنیتی تولید کند\"\n    risk: medium\n    verifymethod: inspection\n  }\n\n  element auth_service {\n    type: \"backend-service\"\n    docref: \"src/auth\"\n  }\n\n  element login_tests {\n    type: \"automated-test\"\n    docref: \"tests/auth/login.spec\"\n  }\n\n  element audit_review {\n    type: \"inspection-checklist\"\n    docref: \"docs/security/audit-events.md\"\n  }\n\n  auth_security - contains -> secure_login\n  auth_security - contains -> rate_limit\n  auth_security - contains -> audit_event\n  auth_service - satisfies -> secure_login\n  auth_service - satisfies -> rate_limit\n  auth_service - satisfies -> audit_event\n  login_tests - verifies -> secure_login\n  login_tests - verifies -> rate_limit\n  audit_review - verifies -> audit_event"
  },
  {
    "id": "product-roadmap-timeline",
    "category": "planning",
    "badge": "Roadmap",
    "title": "Timeline roadmap محصول",
    "description": "قالب فارسی برای نمایش milestoneهای roadmap محصول در چهار فصل، بدون ورود به مدت و وابستگی taskها.",
    "keywords": "timeline mermaid roadmap محصول تایم لاین خط زمانی milestone برنامه ریزی",
    "tutorial": "/learn/timeline-mermaid",
    "article": "/articles/timeline-vs-gantt-for-roadmaps",
    "code": "timeline\n  title Roadmap محصول ۱۴۰۵\n  section کشف\n    بهار : مصاحبه با کاربران\n         : تعریف مسئله‌های اولویت‌دار\n  section ساخت\n    تابستان : نسخهٔ آزمایشی\n            : سنجش رفتار استفاده\n  section رشد\n    پاییز : گزارش‌گیری تیمی\n          : بهبود onboarding\n  section تثبیت\n    زمستان : بهینه‌سازی عملکرد\n            : بازبینی roadmap سال بعد"
  },
  {
    "id": "content-release-kanban",
    "category": "planning",
    "badge": "کانبان",
    "title": "برد کانبان انتشار محتوا",
    "description": "قالب فارسی برای نمایش فرصت، آماده‌سازی، تولید، بازبینی فنی و انتشار محتوا با task metadata قابل ویرایش.",
    "keywords": "Kanban Mermaid قالب کانبان انتشار محتوا workflow task board metadata",
    "tutorial": "/learn/kanban-mermaid",
    "article": "/articles/kanban-vs-gantt-for-team-work",
    "code": "kanban\n  opportunities[فرصت‌ها]\n    topic[انتخاب موضوع]@{ ticket: SEO-201, priority: 'High' }\n  ready[آماده تولید]\n    brief[تدوین Brief]@{ assigned: 'تحریریه' }\n    article[نوشتن مقاله]@{ ticket: SEO-203, assigned: 'تحریریه', priority: 'High' }\n    tutorial[نوشتن آموزش]@{ ticket: SEO-204, assigned: 'تحریریه' }\n  review[بازبینی]\n    render[تست رندر]@{ assigned: 'CI' }\n    seo[بازبینی SEO و canonical]@{ assigned: 'CI', priority: 'Very High' }\n  done[منتشرشده]\n    live[انتشار URL]"
  },
  {
    "id": "gitflow-release",
    "category": "software",
    "badge": "Git و انتشار",
    "title": "Git Flow برای feature، release و hotfix",
    "description": "قالب GitGraph قابل ویرایش برای feature، develop، release، Tag نسخه و hotfix؛ مناسب مستند Branching Strategy و onboarding تیم.",
    "keywords": "GitGraph Mermaid قالب Git Flow branching strategy feature release hotfix commit branch merge tag نمودار شاخه گیت",
    "tutorial": "/learn/gitgraph-mermaid",
    "article": "/articles/gitgraph-for-branching-strategy",
    "code": "gitGraph LR:\n  commit id: \"v1.3.0\" tag: \"v1.3.0\"\n  branch develop\n  commit id: \"prepare_1_4\"\n  branch feature_auth\n  commit id: \"auth_ui\"\n  commit id: \"auth_api\"\n  checkout develop\n  merge feature_auth id: \"merge_auth\"\n  branch release_1_4\n  commit id: \"release_qa\"\n  checkout main\n  merge release_1_4 id: \"release_1_4\" tag: \"v1.4.0\"\n  checkout develop\n  merge release_1_4 id: \"sync_1_4\"\n  checkout main\n  branch hotfix_payment\n  commit id: \"payment_fix\" type: HIGHLIGHT\n  checkout main\n  merge hotfix_payment id: \"hotfix_1_4_1\" tag: \"v1.4.1\"\n  checkout develop\n  merge hotfix_payment id: \"sync_hotfix\""
  },
  {
    "id": "order-state",
    "category": "software",
    "badge": "ماشین حالت",
    "title": "چرخهٔ وضعیت سفارش",
    "description": "قالب آماده برای سفارش، پرداخت، ارسال، لغو، مرجوعی و بازپرداخت.",
    "keywords": "state diagram stateDiagram-v2 نمودار حالت ماشین حالت چرخه سفارش پرداخت ارسال مرجوعی",
    "tutorial": "/learn/state-diagram-mermaid",
    "article": "/articles/state-diagram-vs-flowchart",
    "code": "stateDiagram-v2\n  direction LR\n  state \"پیش‌نویس\" as Draft\n  state \"در انتظار پرداخت\" as PendingPayment\n  state \"پرداخت‌شده\" as Paid\n  state \"آماده‌سازی\" as Preparing\n  state \"ارسال‌شده\" as Shipped\n  state \"تحویل‌شده\" as Delivered\n  state \"لغوشده\" as Cancelled\n  state \"مرجوع‌شده\" as Returned\n  state \"بازپرداخت‌شده\" as Refunded\n\n  [*] --> Draft\n  Draft --> PendingPayment: ثبت نهایی\n  PendingPayment --> Paid: پرداخت موفق\n  PendingPayment --> Cancelled: انصراف یا انقضا\n  Paid --> Preparing: تأیید موجودی\n  Paid --> Refunded: عدم تأمین\n  Preparing --> Shipped: تحویل به پست\n  Shipped --> Delivered: تحویل موفق\n  Shipped --> Returned: برگشت مرسوله\n  Delivered --> Returned: درخواست مرجوعی\n  Returned --> Refunded: تأیید بازپرداخت\n  Delivered --> [*]\n  Cancelled --> [*]\n  Refunded --> [*]"
  },
  { id: 'flowchart', category: 'process', badge: 'فرایند', title: 'فلوچارت تصمیم‌گیری', description: 'برای مسیرهای شرطی، عملیات و گردش کار.', keywords: 'فلوچارت flowchart فرایند تصمیم workflow', code: `flowchart TD
  A[شروع درخواست] --> B{اطلاعات کامل است؟}
  B -- بله --> C[پردازش درخواست]
  B -- خیر --> D[تکمیل اطلاعات]
  D --> B
  C --> E[پایان]` },
  { id: 'sequence', category: 'software', badge: 'نرم‌افزار', title: 'تعامل کاربر و API', description: 'برای مستندسازی درخواست‌ها و پاسخ سرویس‌ها.', keywords: 'sequence توالی api درخواست سرویس نرم افزار', code: `sequenceDiagram
  autonumber
  actor U as کاربر
  participant W as وب‌اپ
  participant A as API
  U->>W: ثبت فرم
  W->>A: POST /requests
  A-->>W: 201 Created
  W-->>U: نمایش نتیجه` },
  { id: 'erd', category: 'data', badge: 'داده', title: 'مدل فروشگاه', description: 'شروع سریع برای طراحی موجودیت‌ها و ارتباط‌ها.', keywords: 'erd er entity relationship database پایگاه داده موجودیت رابطه', code: `erDiagram
  CUSTOMER ||--o{ ORDER : places
  ORDER ||--|{ ORDER_ITEM : contains
  PRODUCT ||--o{ ORDER_ITEM : appears_in
  CUSTOMER {
    int id PK
    string name
  }
  ORDER {
    int id PK
    date created_at
  }` },
  { id: 'class', category: 'software', badge: 'UML', title: 'نمودار کلاس سرویس', description: 'برای طراحی کلاس‌ها، ویژگی‌ها و وابستگی‌ها.', keywords: 'class uml کلاس شی گرایی object oriented software', code: `classDiagram
  class User {
    +String name
    +String email
    +login()
  }
  class Project {
    +String title
    +archive()
  }
  User "1" --> "*" Project : owns` },
  { id: 'gantt', category: 'planning', badge: 'برنامه‌ریزی', title: 'زمان‌بندی انتشار', description: 'نمایش مرحله‌ها، وابستگی‌ها و موعدها.', keywords: 'gantt گانت زمان بندی برنامه ریزی پروژه timeline', code: `gantt
  title برنامه انتشار محصول
  dateFormat YYYY-MM-DD
  section طراحی
  تحقیق کاربران :done, research, 2026-07-01, 5d
  رابط کاربری :active, ui, after research, 7d
  section توسعه
  نسخه اولیه :dev, after ui, 10d
  تست و انتشار :after dev, 5d` },
  { id: 'mindmap', category: 'planning', badge: 'ایده‌پردازی', title: 'نقشه ذهنی محتوا', description: 'برای شکستن یک موضوع به شاخه‌های قابل اجرا.', keywords: 'mindmap نقشه ذهنی ایده پردازی برنامه محتوا', code: `mindmap
  root((محصول))
    مخاطب
      توسعه‌دهنده
      دانشجو
    محتوا
      آموزش
      قالب‌ها
    رشد
      SEO
      تبلیغات` },
  { id: 'architecture', category: 'software', badge: 'معماری', title: 'معماری سرویس ابری', description: 'نمایش API، پایگاه داده و فضای ذخیره‌سازی.', keywords: 'architecture معماری cloud aws سرویس زیرساخت system', code: `architecture-beta
  group cloud(logos:aws)[Cloud]
  service api(logos:aws-lambda)[API] in cloud
  service db(logos:aws-rds)[Database] in cloud
  service store(logos:aws-s3)[Storage] in cloud
  api:R --> L:db
  api:B --> T:store` },
  { id: 'journey', category: 'process', badge: 'تجربه کاربر', title: 'سفر کاربر', description: 'ثبت مرحله‌ها و میزان رضایت در یک سناریو.', keywords: 'journey سفر کاربر تجربه مشتری ux process', code: `journey
  title ساخت اولین نمودار
  section شروع
    ورود به ادیتور: 5: کاربر
    انتخاب قالب: 5: کاربر
  section ساخت
    ویرایش کد: 4: کاربر
    دریافت خروجی: 5: کاربر` },
];

const grid = document.querySelector('#templates-grid');
const search = document.querySelector('#template-search');
const count = document.querySelector('#template-count');
const empty = document.querySelector('#template-empty');
const toast = document.querySelector('#copy-toast');
const filters = [...document.querySelectorAll('[data-category]')];
let category = 'all';
let toastTimer;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function shareUrl(template) {
  const state = { code: template.code, theme: 'default', layout: 'dagre', background: 'white', config: '', css: '' };
  const bytes = new TextEncoder().encode(JSON.stringify(state));
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  const token = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `/editor#code=${encodeURIComponent(`u:${token}`)}`;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
}

function relatedLinks(template) {
  const links = [];
  if (template.tutorial) links.push(`<a href="${escapeHtml(template.tutorial)}">آموزش این نمودار</a>`);
  if (template.article) links.push(`<a href="${escapeHtml(template.article)}">راهنمای انتخاب نمودار</a>`);
  return links.length ? `<nav class="template-related" aria-label="مطالب مرتبط">${links.join('')}</nav>` : '';
}

function card(template) {
  return `<article id="template-${escapeHtml(template.id)}" class="template-card" data-id="${escapeHtml(template.id)}">
    <div class="template-card-head"><div><h3>${escapeHtml(template.title)}</h3><p>${escapeHtml(template.description)}</p></div><span class="template-badge">${escapeHtml(template.badge)}</span></div>
    <pre class="template-code"><code>${escapeHtml(template.code)}</code></pre>
    ${relatedLinks(template)}
    <div class="template-actions"><a class="button button-primary" href="${shareUrl(template)}">ویرایش قالب</a><button class="button button-secondary copy-template" type="button" data-id="${escapeHtml(template.id)}">کپی کد</button></div>
  </article>`;
}

function render() {
  const query = search.value.trim().toLocaleLowerCase('fa');
  const visible = templates.filter((template) => (category === 'all' || template.category === category) && (!query || `${template.title} ${template.description} ${template.keywords}`.toLocaleLowerCase('fa').includes(query)));
  grid.innerHTML = visible.map(card).join('');
  count.textContent = `${visible.length.toLocaleString('fa-IR')} قالب`;
  empty.hidden = visible.length !== 0;
}

filters.forEach((button) => button.addEventListener('click', () => {
  category = button.dataset.category;
  filters.forEach((item) => item.classList.toggle('active', item === button));
  render();
}));
search.addEventListener('input', render);
grid.addEventListener('click', async (event) => {
  const button = event.target.closest('.copy-template');
  if (!button) return;
  const template = templates.find((item) => item.id === button.dataset.id);
  if (!template) return;
  try { await navigator.clipboard.writeText(template.code); showToast('کد قالب کپی شد.'); }
  catch { showToast('مرورگر اجازهٔ کپی نداد.'); }
});

startBidiIsolation();
render();
