const templates = [
  {
    "id": "order-state",
    "category": "software",
    "badge": "ماشین حالت",
    "title": "چرخهٔ وضعیت سفارش",
    "description": "قالب آماده برای سفارش، پرداخت، ارسال، لغو، مرجوعی و بازپرداخت.",
    "keywords": "state diagram stateDiagram-v2 نمودار حالت ماشین حالت چرخه سفارش پرداخت ارسال مرجوعی",
    "code": "stateDiagram-v2\n  direction LR\n  state \"پیش‌نویس\" as Draft\n  state \"در انتظار پرداخت\" as PendingPayment\n  state \"پرداخت‌شده\" as Paid\n  state \"آماده‌سازی\" as Preparing\n  state \"ارسال‌شده\" as Shipped\n  state \"تحویل‌شده\" as Delivered\n  state \"لغوشده\" as Cancelled\n  state \"مرجوع‌شده\" as Returned\n  state \"بازپرداخت‌شده\" as Refunded\n\n  [*] --> Draft\n  Draft --> PendingPayment: ثبت نهایی\n  PendingPayment --> Paid: پرداخت موفق\n  PendingPayment --> Cancelled: انصراف یا انقضا\n  Paid --> Preparing: تأیید موجودی\n  Paid --> Refunded: عدم تأمین\n  Preparing --> Shipped: تحویل به پست\n  Shipped --> Delivered: تحویل موفق\n  Shipped --> Returned: برگشت مرسوله\n  Delivered --> Returned: درخواست مرجوعی\n  Returned --> Refunded: تأیید بازپرداخت\n  Delivered --> [*]\n  Cancelled --> [*]\n  Refunded --> [*]"
  },
  { id: 'flowchart', category: 'process', badge: 'فرایند', title: 'فلوچارت تصمیم‌گیری', description: 'برای مسیرهای شرطی، عملیات و گردش کار.', keywords: 'فلوچارت flowchart فرایند تصمیم workflow', code: `flowchart TD\n  A[شروع درخواست] --> B{اطلاعات کامل است؟}\n  B -- بله --> C[پردازش درخواست]\n  B -- خیر --> D[تکمیل اطلاعات]\n  D --> B\n  C --> E[پایان]` },
  { id: 'sequence', category: 'software', badge: 'نرم‌افزار', title: 'تعامل کاربر و API', description: 'برای مستندسازی درخواست‌ها و پاسخ سرویس‌ها.', keywords: 'sequence توالی api درخواست سرویس نرم افزار', code: `sequenceDiagram\n  autonumber\n  actor U as کاربر\n  participant W as وب‌اپ\n  participant A as API\n  U->>W: ثبت فرم\n  W->>A: POST /requests\n  A-->>W: 201 Created\n  W-->>U: نمایش نتیجه` },
  { id: 'erd', category: 'data', badge: 'داده', title: 'مدل فروشگاه', description: 'شروع سریع برای طراحی موجودیت‌ها و ارتباط‌ها.', keywords: 'erd er entity relationship database پایگاه داده موجودیت رابطه', code: `erDiagram\n  CUSTOMER ||--o{ ORDER : places\n  ORDER ||--|{ ORDER_ITEM : contains\n  PRODUCT ||--o{ ORDER_ITEM : appears_in\n  CUSTOMER {\n    int id PK\n    string name\n  }\n  ORDER {\n    int id PK\n    date created_at\n  }` },
  { id: 'class', category: 'software', badge: 'UML', title: 'نمودار کلاس سرویس', description: 'برای طراحی کلاس‌ها، ویژگی‌ها و وابستگی‌ها.', keywords: 'class uml کلاس شی گرایی object oriented software', code: `classDiagram\n  class User {\n    +String name\n    +String email\n    +login()\n  }\n  class Project {\n    +String title\n    +archive()\n  }\n  User "1" --> "*" Project : owns` },
  { id: 'gantt', category: 'planning', badge: 'برنامه‌ریزی', title: 'زمان‌بندی انتشار', description: 'نمایش مرحله‌ها، وابستگی‌ها و موعدها.', keywords: 'gantt گانت زمان بندی برنامه ریزی پروژه timeline', code: `gantt\n  title برنامه انتشار محصول\n  dateFormat YYYY-MM-DD\n  section طراحی\n  تحقیق کاربران :done, research, 2026-07-01, 5d\n  رابط کاربری :active, ui, after research, 7d\n  section توسعه\n  نسخه اولیه :dev, after ui, 10d\n  تست و انتشار :after dev, 5d` },
  { id: 'mindmap', category: 'planning', badge: 'ایده‌پردازی', title: 'نقشه ذهنی محتوا', description: 'برای شکستن یک موضوع به شاخه‌های قابل اجرا.', keywords: 'mindmap نقشه ذهنی ایده پردازی برنامه محتوا', code: `mindmap\n  root((محصول))\n    مخاطب\n      توسعه‌دهنده\n      دانشجو\n    محتوا\n      آموزش\n      قالب‌ها\n    رشد\n      SEO\n      تبلیغات` },
  { id: 'architecture', category: 'software', badge: 'معماری', title: 'معماری سرویس ابری', description: 'نمایش API، پایگاه داده و فضای ذخیره‌سازی.', keywords: 'architecture معماری cloud aws سرویس زیرساخت system', code: `architecture-beta\n  group cloud(logos:aws)[Cloud]\n  service api(logos:aws-lambda)[API] in cloud\n  service db(logos:aws-rds)[Database] in cloud\n  service store(logos:aws-s3)[Storage] in cloud\n  api:R --> L:db\n  api:B --> T:store` },
  { id: 'journey', category: 'process', badge: 'تجربه کاربر', title: 'سفر کاربر', description: 'ثبت مرحله‌ها و میزان رضایت در یک سناریو.', keywords: 'journey سفر کاربر تجربه مشتری ux process', code: `journey\n  title ساخت اولین نمودار\n  section شروع\n    ورود به ادیتور: 5: کاربر\n    انتخاب قالب: 5: کاربر\n  section ساخت\n    ویرایش کد: 4: کاربر\n    دریافت خروجی: 5: کاربر` },
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

function card(template) {
  return `<article class="template-card" data-id="${template.id}">
    <div class="template-card-head"><div><h3>${escapeHtml(template.title)}</h3><p>${escapeHtml(template.description)}</p></div><span class="template-badge">${escapeHtml(template.badge)}</span></div>
    <pre class="template-code"><code>${escapeHtml(template.code)}</code></pre>
    <div class="template-actions"><a class="button button-primary" href="${shareUrl(template)}">ویرایش قالب</a><button class="button button-secondary copy-template" type="button" data-id="${template.id}">کپی کد</button></div>
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
render();
