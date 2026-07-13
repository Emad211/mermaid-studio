#!/usr/bin/env python3
from pathlib import Path

js_path = Path('public/js/analytics-dashboard.js')
css_path = Path('public/css/analytics.css')
js = js_path.read_text(encoding='utf-8')
css = css_path.read_text(encoding='utf-8')

anchor = """function setMessage(selector, message, state = '') {
  const element = $(selector);
  if (!element) return;
  element.textContent = message;
  element.className = `form-message ${state}`.trim();
}

"""
helper = anchor + """let notificationTimer;
function notify(message, state = 'ok') {
  let element = $('#admin-toast');
  if (!element) {
    element = document.createElement('div');
    element.id = 'admin-toast';
    element.setAttribute('role', state === 'error' ? 'alert' : 'status');
    element.setAttribute('aria-live', state === 'error' ? 'assertive' : 'polite');
    document.body.append(element);
  }
  element.textContent = String(message || '');
  element.className = `admin-toast is-visible ${state}`.trim();
  element.setAttribute('role', state === 'error' ? 'alert' : 'status');
  element.setAttribute('aria-live', state === 'error' ? 'assertive' : 'polite');
  clearTimeout(notificationTimer);
  notificationTimer = setTimeout(() => element.classList.remove('is-visible'), 3_600);
}

"""
if 'function notify(message' not in js:
    if anchor not in js:
        raise SystemExit('setMessage anchor not found')
    js = js.replace(anchor, helper, 1)

replacements = {
"""    alert(`${formatNumber(result.imported)} ردیف نهایی Search Console همگام شد.`);
    await loadDashboard();
  } catch (error) { alert(error.message); }
""": """    notify(`${formatNumber(result.imported)} ردیف نهایی Search Console همگام شد.`);
    await loadDashboard();
  } catch (error) { notify(error.message, 'error'); }
""",
"""    alert(`ممیزی با امتیاز ${formatNumber(result.score)} از ۱۰۰ کامل شد.`);
    await loadDashboard();
    switchView('audit');
  } catch (error) { alert(error.message); }
""": """    notify(`ممیزی با امتیاز ${formatNumber(result.score)} از ۱۰۰ کامل شد.`);
    await loadDashboard();
    switchView('audit');
  } catch (error) { notify(error.message, 'error'); }
""",
"""  catch (error) { alert(error.message); button.disabled = false; }
""": """  catch (error) { notify(error.message, 'error'); button.disabled = false; }
""",
"""  catch (error) { alert(error.message); }
""": """  catch (error) { notify(error.message, 'error'); }
""",
}
for old, new in replacements.items():
    if old in js:
        js = js.replace(old, new)

if "alert(`ممیزی" in js or "alert(`${formatNumber(result.imported)" in js:
    raise SystemExit('blocking success alert remains')

styles = """
.admin-toast {
  max-width: min(440px, calc(100vw - 28px));
  padding: 12px 15px;
  position: fixed;
  inset: auto 18px 18px auto;
  z-index: 100;
  transform: translateY(18px);
  opacity: 0;
  pointer-events: none;
  border: 1px solid rgba(67,216,164,.4);
  border-radius: 12px;
  background: rgba(18,24,36,.96);
  color: var(--a-text);
  box-shadow: var(--a-shadow);
  backdrop-filter: blur(16px);
  line-height: 1.7;
  font-size: 10px;
  transition: opacity .18s ease, transform .18s ease;
}
.admin-toast.is-visible { transform: translateY(0); opacity: 1; }
.admin-toast.error { border-color: rgba(255,113,133,.55); color: #ffb1bd; }

"""
if '.admin-toast {' not in css:
    marker = '@media (max-width: 1500px) {'
    if marker not in css:
        raise SystemExit('CSS media marker not found')
    css = css.replace(marker, styles + marker, 1)

js_path.write_text(js, encoding='utf-8')
css_path.write_text(css, encoding='utf-8')
print('Nonblocking admin notifications applied.')
