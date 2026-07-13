(function () {
  'use strict';

  const originalConfirm = window.confirm.bind(window);
  const exact = new Map([
    ['Clear the editor?', 'کد فعلی پاک شود؟'],
    ['Empty diagram', 'نمودار خالی است'],
    ['Syntax error', 'خطای نگارشی'],
    ['Nothing to export', 'نموداری برای خروجی وجود ندارد'],
    ['Export failed', 'دریافت خروجی ناموفق بود'],
    ['Saved diagram.mmd', 'فایل diagram.mmd ذخیره شد'],
    ['Shareable link copied', 'لینک اشتراک‌گذاری کپی شد'],
    ['Link set in address bar', 'لینک در نوار آدرس قرار گرفت'],
    ['Saved diagram.svg', 'فایل SVG ذخیره شد'],
    ['Saved diagram.png', 'فایل PNG ذخیره شد'],
    ['SVG copied to clipboard', 'کد SVG در کلیپ‌بورد کپی شد'],
    ['Image copied to clipboard', 'تصویر در کلیپ‌بورد کپی شد'],
    ['Loaded shared diagram', 'نمودار اشتراکی بارگذاری شد'],
    ['Ready', 'آماده'],
    ['Examples…', 'نمونه‌ها…'],
  ]);

  const typeLabels = {
    flowchart: 'فلوچارت',
    sequence: 'توالی',
    class: 'کلاس',
    state: 'حالت',
    'entity-relationship': 'ER',
    'user journey': 'مسیر کاربر',
    gantt: 'گانت',
    pie: 'دایره‌ای',
    quadrant: 'چهارخانه',
    requirement: 'نیازمندی',
    'git graph': 'گیت',
    C4: 'C4',
    mindmap: 'نقشه ذهنی',
    timeline: 'خط زمانی',
    sankey: 'Sankey',
    'xy chart': 'نمودار XY',
    block: 'بلوک',
    packet: 'بسته',
    kanban: 'کانبان',
    architecture: 'معماری',
    radar: 'رادار',
    zenuml: 'ZenUML',
    unknown: 'نامشخص',
  };

  const exampleLabels = {
    flowchart: 'فلوچارت',
    sequence: 'نمودار توالی',
    class: 'نمودار کلاس',
    state: 'نمودار حالت',
    er: 'نمودار ER',
    gantt: 'نمودار گانت',
    pie: 'نمودار دایره‌ای',
    mindmap: 'نقشه ذهنی',
    gitgraph: 'نمودار Git',
    journey: 'مسیر کاربر',
    timeline: 'خط زمانی',
    quadrant: 'نمودار چهارخانه',
    architecture: 'معماری با آیکون',
    math: 'فرمول ریاضی',
    c4: 'معماری C4',
    sankey: 'نمودار Sankey',
    xychart: 'نمودار XY',
  };

  const themeLabels = {
    default: 'پیش‌فرض',
    neutral: 'خنثی',
    dark: 'تیره',
    forest: 'جنگل',
    base: 'پایه',
  };

  const layoutLabels = {
    dagre: 'Dagre — استاندارد',
    elk: 'ELK — پیشرفته',
  };

  window.confirm = function (message) {
    return originalConfirm(exact.get(String(message)) || message);
  };

  function translate(value) {
    const text = String(value || '');
    if (exact.has(text)) return exact.get(text);

    let match = /^Rendered in (\d+) ms$/.exec(text);
    if (match) return `رندر در ${match[1]} میلی‌ثانیه`;

    match = /^Loaded (.+)$/.exec(text);
    if (match) return `فایل ${match[1]} بارگذاری شد`;

    match = /^Saved diagram\.(svg|png|jpg|webp|pdf)$/.exec(text);
    if (match) return `فایل ${match[1].toUpperCase()} ذخیره شد`;

    match = /^Ln (\d+), Col (\d+)$/.exec(text);
    if (match) return `خط ${match[1]}، ستون ${match[2]}`;

    match = /^(\d+) chars$/.exec(text);
    if (match) return `${match[1]} نویسه`;

    if (text.startsWith('Invalid JSON:')) {
      return `JSON نامعتبر است: ${text.slice('Invalid JSON:'.length).trim()}`;
    }

    if (text.startsWith('Server render failed')) {
      return `رندر روی سرور ناموفق بود ${text.replace('Server render failed', '')}`;
    }

    if (typeLabels[text]) return typeLabels[text];
    return text;
  }

  function translateElement(element) {
    if (!element) return;
    const current = element.textContent;
    const translated = translate(current);
    if (translated !== current) element.textContent = translated;
  }

  function translateSelect() {
    const select = document.getElementById('examples-select');
    if (!select) return;
    for (const option of select.options) {
      if (!option.value) option.textContent = 'نمونه‌ها…';
      else if (exampleLabels[option.value]) option.textContent = exampleLabels[option.value];
    }
  }

  function translateProductSelects() {
    const theme = document.getElementById('theme-select');
    if (theme) {
      for (const option of theme.options) {
        if (themeLabels[option.value]) option.textContent = themeLabels[option.value];
      }
    }

    const layout = document.getElementById('layout-select');
    if (layout) {
      for (const option of layout.options) {
        if (layoutLabels[option.value]) option.textContent = layoutLabels[option.value];
      }
    }
  }

  function setupObservers() {
    const targets = ['toast', 'status-msg', 'cursor-pos', 'char-count', 'config-error', 'type-chip'];
    for (const id of targets) {
      const element = document.getElementById(id);
      if (!element) continue;
      const observer = new MutationObserver(() => translateElement(element));
      observer.observe(element, { childList: true, characterData: true, subtree: true });
      translateElement(element);
    }

    const examples = document.getElementById('examples-select');
    if (examples) {
      new MutationObserver(translateSelect).observe(examples, { childList: true, subtree: true });
      translateSelect();
    }

    for (const id of ['theme-select', 'layout-select']) {
      const select = document.getElementById(id);
      if (select) new MutationObserver(translateProductSelects).observe(select, { childList: true, subtree: true });
    }
    translateProductSelects();
  }

  function applySponsor(meta) {
    const slot = document.getElementById('sponsor-slot');
    const name = document.getElementById('sponsor-slot-name');
    if (!slot || !name || !meta?.sponsor?.name || !meta?.sponsor?.url) return;
    name.textContent = meta.sponsor.name;
    slot.href = meta.sponsor.url;
    slot.hidden = false;
  }

  function loadProductMeta() {
    fetch('/api/meta', { credentials: 'same-origin' })
      .then((response) => (response.ok ? response.json() : null))
      .then((meta) => {
        if (!meta) return;
        applySponsor(meta);
        if (meta.publicMode && !meta.allowUnsafeMermaid) {
          document.documentElement.dataset.safeMode = 'true';
        }
      })
      .catch(() => {
        // The editor works offline without product metadata.
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setupObservers();
      loadProductMeta();
    });
  } else {
    setupObservers();
    loadProductMeta();
  }
})();
