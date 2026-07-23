import { startBidiIsolation } from './bidi.js';

const templates = [
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
    "description": "قالب فارسی برای مدیریت Snapshot فرصت، تولید، بازبینی فنی و انتشار مقاله، آموزش و قالب Mermaid.",
    "keywords": "کانبان Mermaid قالب Kanban انتشار محتوا sprint workflow برنامه ریزی",
    "tutorial": "/learn/kanban-mermaid",
    "article": "/articles/kanban-vs-gantt-for-team-work",
    "code": "kanban\n  opportunities[فرصت‌ها]\n    topic[انتخاب موضوع]@{ ticket: SEO-201, priority: 'High' }\n  ready[آماده]\n    brief[Brief و intent تأییدشده]@{ assigned: 'تحریریه' }\n  doing[در حال تولید — حداکثر ۲]\n    article[نگارش مقاله]@{ ticket: SEO-203, assigned: 'نویسنده', priority: 'High' }\n    tutorial[ساخت آموزش]@{ ticket: SEO-204, assigned: 'نویسنده' }\n  review[بازبینی]\n    render[رندر مثال‌ها]@{ assigned: 'CI' }\n    seo[کنترل canonical و schema]@{ assigned: 'CI', priority: 'Very High' }\n  done[منتشرشده]\n    live[بررسی URL زنده]"
  },
  {
    "id": "gitflow-release",
    "category": "software",
    "badge": "Git و انتشار",
    "title": "Git Flow برای release و hotfix",
    "description": "قالب GitGraph قابل ویرایش برای feature، develop، release، tag نسخه و hotfix.",
    "keywords": "GitGraph Mermaid قالب Git Flow branching strategy release hotfix نمودار شاخه گیت",
    "tutorial": "/learn/gitgraph-mermaid",
    "article": "/articles/gitgraph-for-branching-strategy",
    "code": "gitGraph LR:\n  commit id: \"v1.3.0\" tag: \"v1.3.0\"\n  branch develop\n  commit id: \"prepare-1.4\"\n  branch feature-auth\n  commit id: \"auth-ui\"\n  commit id: \"auth-api\"\n  checkout develop\n  merge feature-auth id: \"merge-auth\"\n  branch release-1.4\n  commit id: \"release-qa\"\n  checkout main\n  merge release-1.4 id: \"release-1.4\" tag: \"v1.4.0\"\n  checkout develop\n  merge release-1.4 id: \"sync-1.4\"\n  checkout main\n  branch hotfix-payment\n  commit id: \"payment-fix\" type: HIGHLIGHT\n  checkout main\n  merge hotfix-payment id: \"hotfix-1.4.1\" tag: \"v1.4.1\"\n  checkout develop\n  merge hotfix-payment id: \"sync-hotfix\""
  },
  {
    id: 'order-state',
    category: 'software',
    badge: 'ماشین حالت',
    title: 'چرخهٔ وضعیت سفارش',
    description: 'قالب آماده برای سفارش، پرداخت، ارسال، لغو، مرجوعی و بازپرداخت.',
    keywords: 'state diagram stateDiagram-v2 نمودار حالت ماشین حالت چرخه سفارش پرداخت ارسال مرجوعی',
    tutorial: '/learn/state-diagram-mermaid',
    article: '/articles/state-diagram-vs-flowchart',
    code: `stateDiagram-v2
  direction LR
  state "پیش‌نویس" as Draft
  state "در انتظار پرداخت" as PendingPayment
  state "پرداخت‌شده" as Paid
  state "آماده‌سازی" as Preparing
  state "ارسال‌شده" as Shipped
  state "تحویل‌شده" as Delivered
  state "لغوشده" as Cancelled
  state "مرجوع‌شده" as Returned
  state "بازپرداخت‌شده" as Refunded

  [*] --> Draft
  Draft --> PendingPayment: ثبت نهایی
  PendingPayment --> Paid: پرداخت موفق
  PendingPayment --> Cancelled: انصراف یا انقضا
  Paid --> Preparing: تأیید موجودی
  Paid --> Refunded: عدم تأمین
  Preparing --> Shipped: تحویل به پست
  Shipped --> Delivered: تحویل موفق
  Shipped --> Returned: برگشت مرسوله
  Delivered --> Returned: درخواست مرجوعی
  Returned --> Refunded: تأیید بازپرداخت
  Delivered --> [*]
  Cancelled --> [*]
  Refunded --> [*]`,
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
