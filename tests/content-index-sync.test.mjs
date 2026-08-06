import test from 'node:test';
import assert from 'node:assert/strict';
import { syncIndexText } from '../scripts/sync-content-indexes.mjs';

const entry = {
  cluster: { name: 'State Diagram در Mermaid', intent: 'آموزشی و حل مسئله' },
  article: { slug: 'state-diagram-vs-flowchart' },
  tutorial: {
    slug: 'state-diagram-mermaid',
    shortTitle: 'نمودار حالت',
    intro: 'راهنمای کامل ساخت ماشین حالت برای چرخهٔ عمر سفارش و تیکت.',
    minutes: 22,
    level: 'مقدماتی تا پیشرفته',
  },
  template: {
    id: 'order-state',
    badge: 'ماشین حالت',
    title: 'چرخهٔ وضعیت سفارش',
    description: 'قالب آماده برای مدل‌سازی وضعیت سفارش، پرداخت و ارسال.',
    code: 'stateDiagram-v2\n  [*] --> Draft\n  Draft --> Paid: پرداخت موفق\n  Paid --> [*]',
  },
};

function fixtures() {
  return {
    learn: '<dl><dt data-guide-count>۸</dt></dl><div><!-- DAILY_TUTORIAL_CARDS --></div><div><!-- DAILY_TUTORIAL_PICKER_ROWS --></div>',
    templates: '<span id="template-count" class="template-count" aria-live="polite">۸ قالب</span><div><!-- DAILY_TEMPLATE_CARDS --></div>',
    templateRegistry: "const templates = [{ id: 'flowchart' }, { id: 'order-state' }];",
  };
}

test('content index sync adds crawlable tutorial and template links', () => {
  const result = syncIndexText(fixtures(), [entry]);
  assert.match(result.learn, /data-tutorial-slug="state-diagram-mermaid"/);
  assert.match(result.learn, /href="\/learn\/state-diagram-mermaid"/);
  assert.match(result.learn, /data-tutorial-picker="state-diagram-mermaid"/);
  assert.match(result.templates, /data-template-id="order-state"/);
  assert.match(result.templates, /href="\/articles\/state-diagram-vs-flowchart"/);
  assert.match(result.templates, /href="\/editor#code=/);
  assert.match(result.templates, />۲ قالب</);
});

test('content index sync is idempotent', () => {
  const once = syncIndexText(fixtures(), [entry]);
  const twice = syncIndexText({ ...once, templateRegistry: fixtures().templateRegistry }, [entry]);
  assert.equal(twice.learn, once.learn);
  assert.equal(twice.templates, once.templates);
});

test('content index sync refreshes existing tutorial, picker and template cards', () => {
  const once = syncIndexText(fixtures(), [entry]);
  const refreshed = structuredClone(entry);
  refreshed.cluster.name = 'State Diagram و چرخهٔ عمر';
  refreshed.cluster.intent = 'آموزشی، مقایسه و یافتن قالب';
  refreshed.tutorial.shortTitle = 'State Diagram پیشرفته';
  refreshed.tutorial.intro = 'نسخهٔ بازبینی‌شدهٔ آموزش با مثال‌های تازه و کنترل معنای انتقال‌ها.';
  refreshed.tutorial.minutes = 27;
  refreshed.template.title = 'چرخهٔ وضعیت سفارش بازبینی‌شده';
  refreshed.template.description = 'قالب تازه برای وضعیت سفارش و مسیر بازپرداخت.';
  refreshed.template.code = 'stateDiagram-v2\n  [*] --> Draft\n  Draft --> Refunded: بازپرداخت\n  Refunded --> [*]';

  const twice = syncIndexText({ ...once, templateRegistry: fixtures().templateRegistry }, [refreshed]);
  const third = syncIndexText({ ...twice, templateRegistry: fixtures().templateRegistry }, [refreshed]);

  assert.match(twice.learn, /State Diagram پیشرفته/);
  assert.match(twice.learn, /۲۷ دقیقه/);
  assert.match(twice.learn, /State Diagram و چرخهٔ عمر/);
  assert.doesNotMatch(twice.learn, /راهنمای کامل ساخت ماشین حالت/);
  assert.equal((twice.learn.match(/data-tutorial-slug="state-diagram-mermaid"/g) || []).length, 1);
  assert.equal((twice.learn.match(/data-tutorial-picker="state-diagram-mermaid"/g) || []).length, 1);
  assert.match(twice.templates, /چرخهٔ وضعیت سفارش بازبینی‌شده/);
  assert.match(twice.templates, /بازپرداخت/);
  assert.doesNotMatch(twice.templates, /قالب آماده برای مدل‌سازی وضعیت سفارش/);
  assert.equal((twice.templates.match(/data-template-id="order-state"/g) || []).length, 1);
  assert.equal(third.learn, twice.learn);
  assert.equal(third.templates, twice.templates);
});
